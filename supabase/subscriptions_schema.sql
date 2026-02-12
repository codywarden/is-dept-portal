-- Subscription cost account tables
create table if not exists sa_subscription_cost_files (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz default now(),
  uploaded_by uuid references auth.users(id),
  original_filename text not null,
  storage_path text,
  style text not null,
  item_count int default 0,
  matched_count int default 0
);

create table if not exists sa_subscription_cost_items (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references sa_subscription_cost_files(id) on delete cascade,
  style text not null,
  retail_customer text,
  legal_name text,
  org_name text,
  customer_name text,
  location text,
  ordered_by text,
  matched_customer_id uuid references sa_customers(id),
  amount numeric(12,2),
  currency text default 'USD',
  invoice_number text,
  order_number text,
  description text,
  serial_number text,
  contract_start date,
  contract_end date,
  due_date date,
  raw_text text,
  created_at timestamptz default now()
);

create index if not exists sa_subscription_cost_items_file_id_idx
  on sa_subscription_cost_items(file_id);

create index if not exists sa_subscription_cost_items_matched_customer_idx
  on sa_subscription_cost_items(matched_customer_id);
