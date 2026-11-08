-- Optional avatar chosen on the profile screen (an id such as 'night-owl').
alter table v2.profiles add column if not exists avatar text
  check (avatar is null or avatar ~ '^[a-z0-9-]{1,40}$');
