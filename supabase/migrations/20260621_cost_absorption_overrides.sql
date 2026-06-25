-- Cost absorption override requests
-- Created when a user selects "Manual Override" on a cost item with no matching sold-to.
-- Requires admin or manager approval before the cost item is considered reconciled.
create table if not exists sa_cost_absorption_overrides (
  id uuid primary key default gen_random_uuid(),
  cost_item_id uuid references sa_subscription_cost_items(id) on delete cascade not null,
  override_person_name text not null,
  reason text not null,
  amount numeric(12,2) not null,
  status text not null default 'pending',
  requested_by_user_id uuid references auth.users(id),
  requested_by_email text,
  reviewed_by_user_id uuid references auth.users(id),
  reviewed_by_email text,
  denial_reason text,
  synthetic_sold_item_id uuid references sa_subscription_sold_items(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sa_cost_absorption_overrides_cost_item_idx
  on sa_cost_absorption_overrides(cost_item_id);

create index if not exists sa_cost_absorption_overrides_status_idx
  on sa_cost_absorption_overrides(status);

drop trigger if exists sa_cost_absorption_overrides_updated_at
  on sa_cost_absorption_overrides;

create trigger sa_cost_absorption_overrides_updated_at
  before update on sa_cost_absorption_overrides
  for each row execute function sa_set_updated_at();

alter table sa_cost_absorption_overrides enable row level security;
