# Glitch Client Website

Minecraft client download site — ready for **Railway.com**.

## Features

- Light purple theme
- Public **Download** button (placeholder text file by default)
- Login / Register system
- **First registered user becomes Owner (Admin)** automatically
- Admin panel:
  - Edit site name, hero text, colors, footer
  - Upload real client file (ZIP/JAR/EXE)
  - Manage user ranks
  - **ZIP Update** system (same logic as your other site) to update website code without redeploying everything

## Local Run

```bash
cd glitch-client
npm install
npm start
```

Open http://localhost:3000

1. Register → first account = Owner
2. Admin panel se client file upload karo
3. Settings / theme edit karo

## Railway.com Deploy

1. Is folder ko GitHub pe push karo
2. Railway → New Project → Deploy from GitHub
3. Start command: `npm start`
4. Optional environment variables:

```
SESSION_SECRET=koi-strong-random-secret
DB_PATH=/app/data/glitch.db
UPLOAD_DIR=/app/public/uploads
NODE_ENV=production
```

5. **Persistent Volume** add karo (recommended):
   - Mount path: `/app/data`  (database ke liye)
   - Optional: `/app/public/uploads` for client files

## Notes

- Placeholder download file: `public/uploads/glitch-client.txt`
- Admin → Client File tab se real client upload kar dena
- ZIP Update: project ZIP upload karo, check → apply. `data/` aur `uploads/` protected rehte hain.
