import json
import os
import boto3
import psycopg2


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
    user_id = body.get('user_id')
    account_name = body.get('account_name')
    currency = body.get('currency', 'USD')
    if not user_id or not account_name:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Missing required fields: user_id, account_name'}),
        }
    connection = None
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO accounts (user_id, account_name, currency)
                VALUES (%s, %s, %s)
                RETURNING account_id, user_id, account_name, currency, created_at, updated_at
                """,
                (user_id, account_name, currency),
            )
            columns = [desc[0] for desc in cursor.description]
            row = cursor.fetchone()
            connection.commit()
            return {
                'statusCode': 201,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps(dict(zip(columns, row)), default=str),
            }
    except psycopg2.errors.ForeignKeyViolation:
        if connection:
            connection.rollback()
        return {
            'statusCode': 404,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': f'User {user_id} does not exist'}),
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
