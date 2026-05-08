import json
import os
import boto3
import psycopg2


VALID_REGIONS = {'us-west-2', 'us-east-2', 'ap-northeast-1'}


def get_db_credentials():
    client = boto3.client('secretsmanager')
    secret_arn = os.environ['CREDENTIALS_SECRET_ARN']
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])


def get_connection():
    credentials = get_db_credentials()
    return psycopg2.connect(
        host=os.environ['DB_HOST'],
        port=int(os.environ['DB_PORT']),
        user=credentials['username'],
        password=credentials['password'],
        dbname='postgres',
        connect_timeout=5,
    )


def handler(event, context):
    body = json.loads(event.get('body', '{}'))
    from_account_id = body.get('from_account_id')
    to_account_id = body.get('to_account_id')
    amount_cents = body.get('amount_cents')
    description = body.get('description')
    application_source_region = body.get('application_source_region')
    idempotency_key = body.get('idempotency_key')
    if not from_account_id and not to_account_id:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'At least one of from_account_id or to_account_id is required'}),
        }
    if not amount_cents:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Missing required field: amount_cents'}),
        }
    if not isinstance(amount_cents, int) or amount_cents <= 0:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'amount_cents must be a positive integer'}),
        }
    if from_account_id and to_account_id and from_account_id == to_account_id:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'from_account_id and to_account_id must be different'}),
        }
    if application_source_region and application_source_region not in VALID_REGIONS:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': f'Invalid region. Must be one of: {", ".join(sorted(VALID_REGIONS))}'}),
        }
    connection = None
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            if from_account_id:
                cursor.execute(
                    """
                    SELECT
                        COALESCE(SUM(CASE WHEN to_account_id = %s THEN amount_cents ELSE 0 END), 0)
                      - COALESCE(SUM(CASE WHEN from_account_id = %s THEN amount_cents ELSE 0 END), 0)
                        AS balance_cents
                    FROM transactions
                    WHERE from_account_id = %s OR to_account_id = %s
                    """,
                    (from_account_id, from_account_id, from_account_id, from_account_id),
                )
                balance_row = cursor.fetchone()
                balance_cents = balance_row[0] if balance_row else 0
                if balance_cents < amount_cents:
                    return {
                        'statusCode': 400,
                        'headers': {'Content-Type': 'application/json'},
                        'body': json.dumps({
                            'error': f'Insufficient funds: balance is {balance_cents} cents but tried to debit {amount_cents} cents',
                        }),
                    }
            cursor.execute(
                """
                INSERT INTO transactions (from_account_id, to_account_id, amount_cents, description, application_source_region, idempotency_key)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING transaction_id, from_account_id, to_account_id, amount_cents, description, application_source_region, idempotency_key, created_at, updated_at
                """,
                (from_account_id, to_account_id, amount_cents, description, application_source_region, idempotency_key),
            )
            columns = [desc[0] for desc in cursor.description]
            row = cursor.fetchone()
            connection.commit()
            return {
                'statusCode': 201,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps(dict(zip(columns, row)), default=str),
            }
    except psycopg2.errors.UniqueViolation:
        if connection:
            connection.rollback()
        return {
            'statusCode': 409,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'A transaction with this idempotency_key already exists'}),
        }
    except psycopg2.errors.ForeignKeyViolation:
        if connection:
            connection.rollback()
        return {
            'statusCode': 404,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'One or both account IDs do not exist'}),
        }
    except Exception as exception:
        if connection:
            connection.rollback()
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(exception)}),
        }
    finally:
        if connection:
            connection.close()
