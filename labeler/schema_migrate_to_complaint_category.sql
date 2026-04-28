-- Upgrade an EXISTING database that still has unfairness_type / justice_violation / severity.
-- Deletes every label (truncate), drops the old columns, adds complaint_category.
-- Run once in Supabase SQL Editor. Export old labels first if you need them.
--
-- If labels was already built from the current schema.sql (complaint_category only),
-- do NOT run this whole script — only clear rows with:
--   truncate table labels restart identity;

begin;

truncate table labels restart identity;

alter table labels
  drop column if exists unfairness_type,
  drop column if exists justice_violation,
  drop column if exists severity;

alter table labels
  add column complaint_category text not null
    check (
      complaint_category in (
        'improper_charges',
        'improper_process',
        'deceptive_discriminatory'
      )
    );

commit;
