-- Migrate complaint_category from a single text slug to text[] (1–2 slugs).
-- Wipes all labels. Run in Supabase SQL Editor after exporting anything you need.
--
-- Drops the old text CHECK (name may vary; common default is below). If drop fails,
-- list constraints: select conname from pg_constraint join pg_class on relname = 'labels';

begin;

truncate table labels restart identity;

alter table labels drop constraint if exists labels_complaint_category_check;

alter table labels
  alter column complaint_category type text[]
  using array[complaint_category]::text[];

alter table labels drop constraint if exists labels_complaint_category_array_check;

alter table labels add constraint labels_complaint_category_array_check
  check (
    cardinality(complaint_category) between 1 and 2
    and complaint_category <@ array[
      'improper_charges',
      'improper_process',
      'deceptive_discriminatory'
    ]::text[]
  );

commit;
