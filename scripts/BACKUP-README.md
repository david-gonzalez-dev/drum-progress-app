# DrumSkills backup (one command, read only)

Makes ONE dated file with the whole database (all tables and the login accounts) in `~/Documents/DrumSkills backups/`.
It only reads from Supabase. It never changes or deletes anything, and it never overwrites an older backup.

## One-time setup
1. Install the tool (free):  `brew install libpq`
2. In Supabase: **Project Settings, Database, Connection string**. Pick the **Session pooler** tab (works everywhere), choose **URI**, copy it, and put your database password where it says `[YOUR-PASSWORD]`.
   (Forgot the password? On the same page click **Reset database password**. The app keeps working, it uses other keys.)
3. Create the private file `~/.drumskills-backup.env` (it is NOT in the project, so it can never go to GitHub). One line:

       DATABASE_URL='postgresql://postgres.xxxx:YOURPASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres'

   In Terminal: `nano ~/.drumskills-backup.env`, paste the line, press Control+O, Enter, Control+X.

## Every time
    bash "/Users/david/Documents/AI Projects/Drum Progress App/scripts/backup.sh"

Do it once a week, and always before a big change. Copy the newest file to iCloud or an external drive now and then.
