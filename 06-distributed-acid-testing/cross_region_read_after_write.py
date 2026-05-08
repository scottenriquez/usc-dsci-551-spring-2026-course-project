import json
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
import boto3
import psycopg2


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


PRIMARY_REGION = 'us-west-2'
SECONDARY_REGION = 'us-east-2'
PRIMARY_LOAD_BALANCER_NAME_PREFIX = 'YugabyteDB-Primary'
SECONDARY_LOAD_BALANCER_NAME_PREFIX = 'YugabyteDB-Secondary'
SSM_CREDENTIALS_SECRET_ARN_PARAMETER = '/yugabytedb/multi-region/credentials-secret-arn'
YSQL_PORT = 5433
DB_NAME = 'yugabyte'
ALUM_FULL_NAME = 'Neil Armstrong'
ALUM_EMAIL_PREFIX = 'neil.armstrong'
ACCOUNT_NAME = 'Neil Armstrong Primary'
INITIAL_DEPOSIT_CENTS = 1_000_000
READ_ATTEMPTS = 8
READ_BACKOFF_SECONDS = 0.05
WARMUP_ACCOUNT_ID = 'b1000000-0000-0000-0000-000000000001'


def discover_load_balancer_dns(region: str, name_prefix: str) -> str:
    client = boto3.client('elbv2', region_name=region)
    response = client.describe_load_balancers()
    for load_balancer in response['LoadBalancers']:
        if load_balancer['LoadBalancerName'].startswith(name_prefix):
            return load_balancer['DNSName']
    raise RuntimeError(f'No load balancer with prefix {name_prefix} in {region}')


def discover_secret_arn() -> str:
    client = boto3.client('ssm', region_name=SECONDARY_REGION)
    response = client.get_parameter(Name=SSM_CREDENTIALS_SECRET_ARN_PARAMETER)
    return response['Parameter']['Value']


def fetch_credentials_from_secrets_manager(secret_arn: str) -> tuple[str, str]:
    client = boto3.client('secretsmanager', region_name=SECONDARY_REGION)
    raw = client.get_secret_value(SecretId=secret_arn)['SecretString']
    payload = json.loads(raw)
    return payload['username'], payload['password']


@contextmanager
def connect(host: str, user: str, password: str):
    connection = psycopg2.connect(
        host=host,
        port=YSQL_PORT,
        dbname=DB_NAME,
        user=user,
        password=password,
        connect_timeout=10,
    )
    try:
        yield connection
    finally:
        connection.close()


def balance_sql(account_id: str) -> str:
    return f"""
        select coalesce(sum(case when to_account_id = '{account_id}' then amount_cents else 0 end), 0)
             - coalesce(sum(case when from_account_id = '{account_id}' then amount_cents else 0 end), 0)
                 as balance_cents
        from transactions
        where from_account_id = '{account_id}' or to_account_id = '{account_id}'
    """


def setup_and_deposit(host: str, user: str, password: str) -> dict:
    email_suffix = uuid.uuid4().hex
    idempotency_key = f'acid-deposit-{uuid.uuid4()}'
    email = f'{ALUM_EMAIL_PREFIX}+{email_suffix}@usc.edu'
    timings = {}
    with connect(host, user, password) as connection:
        with connection.cursor() as cursor:
            started_at = utc_now_iso()
            start_time = time.perf_counter()
            cursor.execute(f"""
                insert into users (email, full_name)
                values ('{email}', '{ALUM_FULL_NAME}') returning user_id, created_at
            """)
            user_id, user_created_at = cursor.fetchone()
            connection.commit()
            timings['create_user'] = {
                'started_at': started_at,
                'milliseconds': (time.perf_counter() - start_time) * 1000,
            }
            started_at = utc_now_iso()
            start_time = time.perf_counter()
            cursor.execute(f"""
                insert into accounts (user_id, account_name, currency)
                values ('{user_id}', '{ACCOUNT_NAME}', 'USD') returning account_id, created_at
            """)
            account_id, account_created_at = cursor.fetchone()
            connection.commit()
            timings['create_account'] = {
                'started_at': started_at,
                'milliseconds': (time.perf_counter() - start_time) * 1000,
            }
            started_at = utc_now_iso()
            start_time = time.perf_counter()
            cursor.execute(f"""
                insert into transactions (from_account_id, to_account_id, amount_cents,
                                          description, application_source_region, idempotency_key)
                values (NULL, '{account_id}', {INITIAL_DEPOSIT_CENTS},
                        'Initial deposit (cross-region ACID test)',
                        'us-west-2'::aws_region, '{idempotency_key}')
                returning transaction_id, created_at
            """)
            transaction_id, transaction_created_at = cursor.fetchone()
            connection.commit()
            timings['deposit_commit'] = {
                'started_at': started_at,
                'milliseconds': (time.perf_counter() - start_time) * 1000,
            }

    return {
        'email': email,
        'user_id': str(user_id),
        'account_id': str(account_id),
        'transaction_id': str(transaction_id),
        'transaction_created_at': transaction_created_at.isoformat(),
        'timings': timings,
    }


def warmup_secondary(cursor) -> dict:
    started_at = utc_now_iso()
    start_time = time.perf_counter()
    cursor.execute(balance_sql(WARMUP_ACCOUNT_ID))
    cursor.fetchone()
    return {
        'started_at': started_at,
        'milliseconds': (time.perf_counter() - start_time) * 1000,
    }


def read_balance_loop(cursor, account_id: str) -> list[dict]:
    sql = balance_sql(account_id)
    attempts = []
    for attempt_index in range(READ_ATTEMPTS):
        started_at = utc_now_iso()
        start_time = time.perf_counter()
        cursor.execute(sql)
        (balance_cents,) = cursor.fetchone()
        elapsed_milliseconds = (time.perf_counter() - start_time) * 1000
        attempts.append({
            'attempt': attempt_index + 1,
            'started_at': started_at,
            'balance_cents': int(balance_cents),
            'query_milliseconds': elapsed_milliseconds,
        })
        time.sleep(READ_BACKOFF_SECONDS)
    return attempts


def main() -> None:
    secret_arn = discover_secret_arn()
    primary_nlb = discover_load_balancer_dns(PRIMARY_REGION, PRIMARY_LOAD_BALANCER_NAME_PREFIX)
    secondary_nlb = discover_load_balancer_dns(SECONDARY_REGION, SECONDARY_LOAD_BALANCER_NAME_PREFIX)
    user, password = fetch_credentials_from_secrets_manager(secret_arn)

    print(f'Primary (write): {primary_nlb}')
    print(f'Secondary (read):  {secondary_nlb}')
    print(f'User: {ALUM_FULL_NAME}')
    print(f'Initial deposit: ${INITIAL_DEPOSIT_CENTS / 100:,.2f}')
    print()

    with connect(secondary_nlb, user, password) as secondary_connection:
        secondary_connection.autocommit = True
        with secondary_connection.cursor() as secondary_cursor:
            warmup = warmup_secondary(secondary_cursor)
            print(f'Secondary warm-up read: started_at={warmup["started_at"]}  {warmup["milliseconds"]:.2f} ms')
            print()
            write_start = time.perf_counter()
            setup = setup_and_deposit(primary_nlb, user, password)
            write_done = time.perf_counter()
            print('Write to us-west-2 NLB')
            print(f'email = {setup["email"]}')
            print(f'user_id = {setup["user_id"]}')
            print(f'account_id = {setup["account_id"]}')
            print(f'transaction_id = {setup["transaction_id"]}')
            print(f'transaction_created_at = {setup["transaction_created_at"]}')
            for label, info in setup['timings'].items():
                print(f'  {label:<22} started_at={info["started_at"]}  {info["milliseconds"]:>7.2f} ms')
            attempts = read_balance_loop(secondary_cursor, setup['account_id'])
            read_done = time.perf_counter()

    print()
    print('Read from us-east-2 NLB (with warm connection)')
    for attempt in attempts:
        dollars = attempt['balance_cents'] / 100
        flag = 'HIT ' if attempt['balance_cents'] == INITIAL_DEPOSIT_CENTS else 'MISS'
        print(
            f'attempt {attempt["attempt"]}: {flag} balance=${dollars:>10,.2f} '
            f'started_at={attempt["started_at"]}  {attempt["query_milliseconds"]:.2f} ms'
        )


if __name__ == '__main__':
    main()
