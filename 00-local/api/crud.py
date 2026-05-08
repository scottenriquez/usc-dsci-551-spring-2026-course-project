import json
import os
import psycopg2
import psycopg2.errors


VALID_REGIONS = {'us-west-2', 'us-east-2', 'ap-northeast-1'}

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}


def get_connection():
    return psycopg2.connect(
        host=os.environ['DB_HOST'],
        port=int(os.environ['DB_PORT']),
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        dbname=os.environ['DB_NAME'],
        connect_timeout=5,
    )


def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, default=str),
    }


def format_sql(sql, params=None):
    sql = ' '.join(sql.split())
    if not params:
        return sql
    formatted_params = []
    for p in params:
        if p is None:
            formatted_params.append('NULL')
        elif isinstance(p, str):
            formatted_params.append(f"'{p}'")
        else:
            formatted_params.append(str(p))
    return sql.replace('%s', '{}').format(*formatted_params)


def explain_query(cursor, sql, params=None):
    cursor.execute(f'EXPLAIN ANALYZE {sql}', params or ())
    return '\n'.join(row[0] for row in cursor.fetchall())


def build_preview(cursor, steps):
    for step in steps:
        if step.get('sql') and step.get('params') is not None:
            try:
                step['explain'] = explain_query(cursor, step['raw_sql'], step['params'])
            except Exception as e:
                step['explain'] = f'EXPLAIN error: {e}'

    for step in steps:
        step.pop('raw_sql', None)
        step.pop('params', None)

    combined_sql = ';\n\n'.join(s['sql'] for s in steps if s.get('sql'))
    return response(200, {'sql': combined_sql, 'steps': steps})


def make_step(label, description, sql=None, params=None):
    step = {'label': label, 'description': description}
    if sql is not None:
        step['sql'] = format_sql(sql, params)
        step['raw_sql'] = sql
        step['params'] = params or ()
    return step


def query_rows(cursor, sql, params=None):
    cursor.execute(sql, params or ())
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def query_one(cursor, sql, params=None):
    cursor.execute(sql, params or ())
    columns = [desc[0] for desc in cursor.description]
    row = cursor.fetchone()
    if row is None:
        return None
    return dict(zip(columns, row))


def list_users(cursor, _body, _path_params, preview=False):
    sql = 'SELECT * FROM users ORDER BY created_at DESC'
    if preview:
        return build_preview(cursor, [
            make_step('List Users', 'The handler issues a single <code>SELECT</code> against the <code>users</code> table to retrieve every user, ordered by most recently created.', sql),
        ])
    rows = query_rows(cursor, sql)
    return response(200, rows)


def get_user(cursor, _body, path_params, preview=False):
    sql = 'SELECT * FROM users WHERE user_id = %s'
    params = (path_params['id'],)
    if preview:
        return build_preview(cursor, [
            make_step('Get User', 'The handler issues a point-lookup <code>SELECT</code> against the <code>users</code> table, filtering by the supplied <code>user_id</code> primary key.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    if not row:
        return response(404, {'error': 'User not found'})
    return response(200, row)


def create_user(cursor, body, _path_params, preview=False):
    email = body.get('email')
    full_name = body.get('full_name')
    phone = body.get('phone')
    if not email or not full_name:
        return response(400, {'error': 'Missing required fields: email, full_name'})
    sql = """INSERT INTO users (email, full_name, phone)
           VALUES (%s, %s, %s)
           RETURNING user_id, email, full_name, phone, created_at, updated_at"""
    params = (email, full_name, phone)
    if preview:
        return build_preview(cursor, [
            make_step('Insert User', 'The handler issues an <code>INSERT</code> into the <code>users</code> table, persisting the supplied <code>email</code>, <code>full_name</code>, and optional <code>phone</code>. A unique constraint on <code>email</code> prevents duplicate registrations.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    return response(201, row)


def update_user(cursor, body, path_params, preview=False):
    fields, values = [], []
    for col in ('email', 'full_name', 'phone'):
        if col in body:
            fields.append(f'{col} = %s')
            values.append(body[col])
    if not fields:
        return response(400, {'error': 'No fields to update'})
    fields.append('updated_at = now()')
    values.append(path_params['id'])
    sql = f"""UPDATE users SET {', '.join(fields)}
            WHERE user_id = %s
            RETURNING user_id, email, full_name, phone, created_at, updated_at"""
    if preview:
        return build_preview(cursor, [
            make_step('Update User', 'The handler issues an <code>UPDATE</code> against the <code>users</code> table, modifying only the fields supplied in the request body and refreshing <code>updated_at</code> to the current time.', sql, values),
        ])
    row = query_one(cursor, sql, values)
    if not row:
        return response(404, {'error': 'User not found'})
    return response(200, row)


def delete_user(cursor, _body, path_params, preview=False):
    sql = 'DELETE FROM users WHERE user_id = %s RETURNING user_id'
    params = (path_params['id'],)
    if preview:
        return build_preview(cursor, [
            make_step('Delete User', 'The handler issues a <code>DELETE</code> against the <code>users</code> table keyed on <code>user_id</code>. A foreign key constraint on <code>accounts.user_id</code> blocks the delete if any accounts still reference the user.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    if not row:
        return response(404, {'error': 'User not found'})
    return response(200, {'deleted': row['user_id']})


def list_accounts(cursor, _body, _path_params, preview=False):
    sql = 'SELECT * FROM accounts ORDER BY created_at DESC'
    balance_sql = """SELECT
               COALESCE(SUM(CASE WHEN to_account_id = %s THEN amount_cents ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN from_account_id = %s THEN amount_cents ELSE 0 END), 0)
               AS balance_cents
           FROM transactions
           WHERE from_account_id = %s OR to_account_id = %s"""
    if preview:
        sample = query_one(cursor, 'SELECT account_id FROM accounts LIMIT 1')
        sample_id = str(sample['account_id']) if sample else '00000000-0000-0000-0000-000000000000'
        return build_preview(cursor, [
            make_step('List Accounts', 'The handler issues a single <code>SELECT</code> against the <code>accounts</code> table to retrieve every account, ordered by most recently created.', sql),
            make_step('Compute Balances', 'For each account returned by the previous step, the handler issues an aggregate <code>SELECT</code> against the <code>transactions</code> table that sums inbound minus outbound amounts. This runs once per account.', balance_sql, (sample_id, sample_id, sample_id, sample_id)),
        ])
    rows = query_rows(cursor, sql)
    return response(200, rows)


def get_account(cursor, _body, path_params, preview=False):
    sql = 'SELECT * FROM accounts WHERE account_id = %s'
    params = (path_params['id'],)
    if preview:
        return build_preview(cursor, [
            make_step('Get Account', 'The handler issues a point-lookup <code>SELECT</code> against the <code>accounts</code> table, filtering by the supplied <code>account_id</code> primary key.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    if not row:
        return response(404, {'error': 'Account not found'})
    return response(200, row)


def create_account(cursor, body, _path_params, preview=False):
    user_id = body.get('user_id')
    account_name = body.get('account_name')
    currency = body.get('currency', 'USD')
    if not user_id or not account_name:
        return response(400, {'error': 'Missing required fields: user_id, account_name'})
    sql = """INSERT INTO accounts (user_id, account_name, currency)
           VALUES (%s, %s, %s)
           RETURNING account_id, user_id, account_name, currency, created_at, updated_at"""
    params = (user_id, account_name, currency)
    if preview:
        return build_preview(cursor, [
            make_step('Insert Account', 'The handler issues an <code>INSERT</code> into the <code>accounts</code> table. A foreign key constraint on <code>user_id</code> ensures the owning user exists before the row is committed.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    return response(201, row)


def update_account(cursor, body, path_params, preview=False):
    fields, values = [], []
    for col in ('account_name', 'currency'):
        if col in body:
            fields.append(f'{col} = %s')
            values.append(body[col])
    if not fields:
        return response(400, {'error': 'No fields to update'})
    fields.append('updated_at = now()')
    values.append(path_params['id'])
    sql = f"""UPDATE accounts SET {', '.join(fields)}
            WHERE account_id = %s
            RETURNING account_id, user_id, account_name, currency, created_at, updated_at"""
    if preview:
        return build_preview(cursor, [
            make_step('Update Account', 'The handler issues an <code>UPDATE</code> against the <code>accounts</code> table, modifying only the fields supplied in the request body and refreshing <code>updated_at</code> to the current time.', sql, values),
        ])
    row = query_one(cursor, sql, values)
    if not row:
        return response(404, {'error': 'Account not found'})
    return response(200, row)


def get_account_balance(cursor, _body, path_params, preview=False):
    account_id = path_params['id']
    sql = """SELECT
               COALESCE(SUM(CASE WHEN to_account_id = %s THEN amount_cents ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN from_account_id = %s THEN amount_cents ELSE 0 END), 0)
               AS balance_cents
           FROM transactions
           WHERE from_account_id = %s OR to_account_id = %s"""
    params = (account_id, account_id, account_id, account_id)
    if preview:
        return build_preview(cursor, [
            make_step('Compute Balance', 'The handler issues an aggregate <code>SELECT</code> against the <code>transactions</code> table, summing inbound (<code>to_account_id</code>) minus outbound (<code>from_account_id</code>) amounts for the supplied account.', sql, params),
        ])
    row = query_one(cursor, 'SELECT account_id FROM accounts WHERE account_id = %s', (account_id,))
    if not row:
        return response(404, {'error': 'Account not found'})
    row = query_one(cursor, sql, params)
    return response(200, {'account_id': account_id, 'balance_cents': row['balance_cents']})


def delete_account(cursor, _body, path_params, preview=False):
    sql = 'DELETE FROM accounts WHERE account_id = %s RETURNING account_id'
    params = (path_params['id'],)
    if preview:
        return build_preview(cursor, [
            make_step('Delete Account', 'The handler issues a <code>DELETE</code> against the <code>accounts</code> table keyed on <code>account_id</code>. Foreign key constraints on <code>transactions.from_account_id</code> and <code>transactions.to_account_id</code> block the delete if any transactions still reference the account.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    if not row:
        return response(404, {'error': 'Account not found'})
    return response(200, {'deleted': row['account_id']})


def list_transactions(cursor, _body, _path_params, preview=False):
    sql = 'SELECT * FROM transactions ORDER BY created_at DESC'
    if preview:
        return build_preview(cursor, [
            make_step('List Transactions', 'The handler issues a single <code>SELECT</code> against the <code>transactions</code> table to retrieve every recorded movement, ordered by most recently created.', sql),
        ])
    rows = query_rows(cursor, sql)
    return response(200, rows)


def get_transaction(cursor, _body, path_params, preview=False):
    sql = 'SELECT * FROM transactions WHERE transaction_id = %s'
    params = (path_params['id'],)
    if preview:
        return build_preview(cursor, [
            make_step('Get Transaction', 'The handler issues a point-lookup <code>SELECT</code> against the <code>transactions</code> table, filtering by the supplied <code>transaction_id</code> primary key.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    if not row:
        return response(404, {'error': 'Transaction not found'})
    return response(200, row)


def create_transaction(cursor, body, _path_params, preview=False):
    from_account_id = body.get('from_account_id')
    to_account_id = body.get('to_account_id')
    amount_cents = body.get('amount_cents')
    description = body.get('description')
    application_source_region = body.get('application_source_region')
    idempotency_key = body.get('idempotency_key')
    if not from_account_id and not to_account_id:
        return response(400, {'error': 'At least one of from_account_id or to_account_id is required'})
    if not amount_cents:
        return response(400, {'error': 'Missing required field: amount_cents'})
    if not isinstance(amount_cents, int) or amount_cents <= 0:
        return response(400, {'error': 'amount_cents must be a positive integer'})
    if from_account_id and to_account_id and from_account_id == to_account_id:
        return response(400, {'error': 'from_account_id and to_account_id must be different'})
    if application_source_region and application_source_region not in VALID_REGIONS:
        return response(400, {'error': f'Invalid region. Must be one of: {", ".join(sorted(VALID_REGIONS))}'})
    insert_sql = """INSERT INTO transactions (from_account_id, to_account_id, amount_cents, description, application_source_region, idempotency_key)
           VALUES (%s, %s, %s, %s, %s, %s)
           RETURNING transaction_id, from_account_id, to_account_id, amount_cents, description, application_source_region, idempotency_key, created_at, updated_at"""
    insert_params = (from_account_id, to_account_id, amount_cents, description, application_source_region, idempotency_key)
    if preview:
        steps = []
        if from_account_id:
            balance_sql = """SELECT
                   COALESCE(SUM(CASE WHEN to_account_id = %s THEN amount_cents ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN from_account_id = %s THEN amount_cents ELSE 0 END), 0)
                   AS balance_cents
               FROM transactions
               WHERE from_account_id = %s OR to_account_id = %s"""
            balance_params = (from_account_id, from_account_id, from_account_id, from_account_id)
            steps.append(make_step('Check Balance', 'Before attempting the insert, the handler issues an aggregate <code>SELECT</code> against the <code>transactions</code> table to compute the current balance of the source account. If the balance is less than <code>amount_cents</code>, the handler rejects the request before touching the database.', balance_sql, balance_params))
        insert_description = 'The handler issues an <code>INSERT</code> into the <code>transactions</code> table. The <code>idempotency_key</code> column carries a unique constraint so retried requests do not double-record a movement.'
        if from_account_id:
            insert_description += ' Inside the same transaction, a <code>BEFORE INSERT</code> trigger (<code>check_sufficient_balance()</code>) fires: it acquires a row lock on the source account via <code>SELECT FOR UPDATE</code> and re-computes the balance to prevent concurrent overdrafts.'
        steps.append(make_step('Insert Transaction', insert_description, insert_sql, insert_params))
        return build_preview(cursor, steps)
    if from_account_id:
        balance = query_one(
            cursor,
            """SELECT COALESCE(SUM(CASE WHEN to_account_id = %s THEN amount_cents ELSE 0 END), 0)
                          - COALESCE(SUM(CASE WHEN from_account_id = %s THEN amount_cents ELSE 0 END), 0)
                          AS balance_cents
               FROM transactions
               WHERE from_account_id = %s
                  OR to_account_id = %s""",
            (from_account_id, from_account_id, from_account_id, from_account_id),
        )
        if balance['balance_cents'] < amount_cents:
            return response(400, {
                'error': f'Insufficient funds: balance is {balance["balance_cents"]} cents but tried to debit {amount_cents} cents',
            })
    row = query_one(cursor, insert_sql, insert_params)
    return response(201, row)


def delete_transaction(cursor, _body, path_params, preview=False):
    sql = 'DELETE FROM transactions WHERE transaction_id = %s RETURNING transaction_id'
    params = (path_params['id'],)
    if preview:
        return build_preview(cursor, [
            make_step('Delete Transaction', 'The handler issues a <code>DELETE</code> against the <code>transactions</code> table keyed on <code>transaction_id</code>.', sql, params),
        ])
    row = query_one(cursor, sql, params)
    if not row:
        return response(404, {'error': 'Transaction not found'})
    return response(200, {'deleted': row['transaction_id']})


ROUTES = {
    ('GET',    'users',        False, None):      list_users,
    ('GET',    'users',        True,  None):      get_user,
    ('POST',   'users',        False, None):      create_user,
    ('PUT',    'users',        True,  None):      update_user,
    ('DELETE', 'users',        True,  None):      delete_user,
    ('GET',    'accounts',     False, None):      list_accounts,
    ('GET',    'accounts',     True,  None):      get_account,
    ('GET',    'accounts',     True,  'balance'): get_account_balance,
    ('POST',   'accounts',     False, None):      create_account,
    ('PUT',    'accounts',     True,  None):      update_account,
    ('DELETE', 'accounts',     True,  None):      delete_account,
    ('GET',    'transactions', False, None):      list_transactions,
    ('GET',    'transactions', True,  None):      get_transaction,
    ('POST',   'transactions', False, None):      create_transaction,
    ('DELETE', 'transactions', True,  None):      delete_transaction,
}


def handler(event, context):
    http_method = event.get('httpMethod', '')
    if http_method == 'OPTIONS':
        return response(200, {})

    resource = event.get('resource', '')
    path_params = event.get('pathParameters') or {}
    query_params = event.get('queryStringParameters') or {}
    preview = query_params.get('preview') == 'true'

    if preview:
        override_method = query_params.get('method', http_method)
        override_body_str = query_params.get('body')
        override_body = json.loads(override_body_str) if override_body_str else {}
        parts = resource.strip('/').split('/')
        entity = parts[0] if parts else ''
        has_id = len(parts) > 1
        sub_resource = parts[2] if len(parts) > 2 else None
        route_key = (override_method, entity, has_id, sub_resource)
        route_handler = ROUTES.get(route_key)
        if not route_handler:
            return response(404, {'error': f'No route for {override_method} {resource}'})
        connection = None
        try:
            connection = get_connection()
            with connection.cursor() as cursor:
                result = route_handler(cursor, override_body, path_params, preview=True)
                connection.rollback()
                return result
        except Exception as e:
            if connection:
                connection.rollback()
            return response(500, {'error': str(e)})
        finally:
            if connection:
                connection.close()

    parts = resource.strip('/').split('/')
    entity = parts[0] if parts else ''
    has_id = len(parts) > 1
    sub_resource = parts[2] if len(parts) > 2 else None

    route_key = (http_method, entity, has_id, sub_resource)
    route_handler = ROUTES.get(route_key)
    if not route_handler:
        return response(404, {'error': f'No route for {http_method} {resource}'})

    body = {}
    if event.get('body'):
        body = json.loads(event['body'])

    connection = None
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            result = route_handler(cursor, body, path_params)
            connection.commit()
            return result
    except psycopg2.errors.UniqueViolation as e:
        if connection:
            connection.rollback()
        return response(409, {'error': str(e).split('\n')[0]})
    except psycopg2.errors.ForeignKeyViolation as e:
        if connection:
            connection.rollback()
        return response(404, {'error': str(e).split('\n')[0]})
    except Exception as e:
        if connection:
            connection.rollback()
        return response(500, {'error': str(e)})
    finally:
        if connection:
            connection.close()