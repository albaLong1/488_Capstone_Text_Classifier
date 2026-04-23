-- Run this in the Supabase SQL editor once, before seeding.

create table if not exists complaints (
  id bigint primary key,
  date_received text,
  issue text,
  sub_issue text,
  complaint_what_happened text
);

create table if not exists labels (
  id bigserial primary key,
  complaint_id bigint not null references complaints(id) on delete cascade,
  labeler_name text not null,
  unfairness_type text[] not null check (array_length(unfairness_type, 1) >= 1),
  justice_violation text not null,
  severity text not null,
  created_at timestamptz not null default now(),
  unique (complaint_id, labeler_name)
);

create index if not exists labels_complaint_id_idx on labels(complaint_id);
create index if not exists labels_labeler_name_idx on labels(labeler_name);

-- Returns the next complaint that:
--   * has fewer than 3 labels total
--   * has NOT been labeled by p_name
--   * is not in p_skip (a session-local list of IDs the labeler has skipped)
-- Complaints are served in strict id order so that everyone works on the same
-- complaints until they hit 3 labels and drop out of the queue. This maximizes
-- the number of fully-labeled complaints you have at any point.
-- Returns zero rows when the labeler is done.
create or replace function get_next_complaint(p_name text, p_skip bigint[] default '{}')
returns table (
  id bigint,
  issue text,
  sub_issue text,
  complaint_what_happened text,
  label_count bigint
)
language sql
stable
as $$
  select
    c.id,
    c.issue,
    c.sub_issue,
    c.complaint_what_happened,
    coalesce(lc.n, 0) as label_count
  from complaints c
  left join (
    select complaint_id, count(*)::bigint as n
    from labels
    group by complaint_id
  ) lc on lc.complaint_id = c.id
  where coalesce(lc.n, 0) < 3
    and not exists (
      select 1 from labels l
      where l.complaint_id = c.id and l.labeler_name = p_name
    )
    and c.id <> all(p_skip)
  order by c.id asc
  limit 1;
$$;
