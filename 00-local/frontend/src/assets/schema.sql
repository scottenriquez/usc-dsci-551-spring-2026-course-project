create
extension if not exists pgcrypto;

create type aws_region as enum (
    'us-west-2',
    'us-east-2',
    'ap-northeast-1'
);

create table users
(
    user_id    uuid primary key      default gen_random_uuid(),
    email      varchar(320) not null unique,
    full_name  text         not null,
    phone      varchar(32),
    created_at timestamptz  not null default now(),
    updated_at timestamptz  not null default now()
);

create table accounts
(
    account_id   uuid primary key     default gen_random_uuid(),
    user_id      uuid        not null references users (user_id),
    account_name text        not null,
    currency     char(3)     not null default 'USD',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table transactions
(
    transaction_id            uuid primary key     default gen_random_uuid(),
    from_account_id           uuid references accounts (account_id),
    to_account_id             uuid references accounts (account_id),
    amount_cents              bigint      not null,
    description               text,
    application_source_region aws_region,
    idempotency_key           varchar(128) unique,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now(),

    constraint check_amount_positive check (amount_cents > 0),
    constraint check_has_account check (from_account_id is not null or to_account_id is not null),
    constraint check_different_accounts check (from_account_id is distinct from to_account_id
) );

create
or replace function check_sufficient_balance()
    returns trigger as $$
declare
current_balance bigint;
begin
    if
new.from_account_id is null then
        return new;
end if;

    perform
1 from accounts where account_id = new.from_account_id for
update;

select coalesce(sum(case when to_account_id = new.from_account_id then amount_cents else 0 end), 0)
           - coalesce(sum(case when from_account_id = new.from_account_id then amount_cents else 0 end), 0)
into current_balance
from transactions
where from_account_id = new.from_account_id
   or to_account_id = new.from_account_id;

if
current_balance < new.amount_cents then
        raise exception 'Insufficient funds: balance is % cents but tried to debit % cents',
            current_balance, new.amount_cents;
end if;

return new;
end;
$$
language plpgsql;

create trigger trg_check_sufficient_balance
    before insert
    on transactions
    for each row execute function check_sufficient_balance();

create index idx_accounts_user_id
    on accounts (user_id);

create index idx_transactions_from_account
    on transactions (from_account_id, created_at desc) include (amount_cents);

create index idx_transactions_to_account
    on transactions (to_account_id, created_at desc) include (amount_cents);
