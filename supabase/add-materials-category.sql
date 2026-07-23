-- Adds per-course subfolders to Materials. Every material belongs to one of
-- four categories; existing rows fall back to 'extras'. Already applied to the
-- live project via migration `add_materials_category`; kept here for the record.

alter table public.materials
  add column if not exists category text not null default 'extras'
  check (category in ('class_notes', 'tutorial_sheets', 'question_papers', 'extras'));

create index if not exists materials_course_category_idx
  on public.materials (course_id, category);
