INSERT INTO users (user_id, email, full_name)
VALUES
    ('a1000000-0000-0000-0000-000000000001', 'scenriqu@usc.edu', 'Scott Enriquez'),
    ('a2000000-0000-0000-0000-000000000002', 'wenshenw@usc.edu', 'Wensheng Wu');

INSERT INTO accounts (account_id, user_id, account_name, currency)
VALUES
    ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Scott Primary', 'USD'),
    ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'Wensheng Primary', 'USD');

INSERT INTO transactions (transaction_id, from_account_id, to_account_id, amount_cents, description, application_source_region)
VALUES
    (
        'c1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001',
        'b2000000-0000-0000-0000-000000000002',
        5000,
        'Lunch reimbursement',
        'us-west-2'
    ),
    (
        'c2000000-0000-0000-0000-000000000002',
        'b1000000-0000-0000-0000-000000000001',
        'b2000000-0000-0000-0000-000000000002',
        12000,
        'Shared subscription split',
        'us-west-2'
    );

INSERT INTO transactions (transaction_id, from_account_id, to_account_id, amount_cents, description, application_source_region)
VALUES
    (
        'c3000000-0000-0000-0000-000000000003',
        'b2000000-0000-0000-0000-000000000002',
        'b1000000-0000-0000-0000-000000000001',
        7500,
        'Parking reimbursement',
        'us-west-2'
    ),
    (
        'c4000000-0000-0000-0000-000000000004',
        'b2000000-0000-0000-0000-000000000002',
        'b1000000-0000-0000-0000-000000000001',
        20000,
        'Concert tickets',
        'us-west-2'
    );

INSERT INTO transactions (transaction_id, from_account_id, to_account_id, amount_cents, description, application_source_region)
VALUES
    (
        'c5000000-0000-0000-0000-000000000005',
        NULL,
        'b1000000-0000-0000-0000-000000000001',
        100000,
        'Initial deposit',
        'us-west-2'
    ),
    (
        'c6000000-0000-0000-0000-000000000006',
        NULL,
        'b2000000-0000-0000-0000-000000000002',
        50000,
        'Initial deposit',
        'us-west-2'
    ),
    (
        'c7000000-0000-0000-0000-000000000007',
        'b1000000-0000-0000-0000-000000000001',
        NULL,
        2500,
        'ATM withdrawal',
        'us-west-2'
    );