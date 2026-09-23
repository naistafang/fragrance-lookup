# Fragrance Lookup

Price and stock lookup site that works on phones and desktops, hosted on GitHub Pages. It reads stock **live** from the private inventory sheet.

- `index.html` is the site. The search ignores accents and capital letters, matches any part of a name, and takes words in any order. It re-checks stock every 60 seconds, and again whenever the page comes back into view.
- `clean.js` turns the raw sheet rows into search entries. It strips prices from names, splits price lists, builds names top row to bottom and fixes typos. **To fix a new typo, add a line to the tables at the top.**
- `apps-script/Code.gs` is the live feed. It runs inside your Google account and returns **only** the Brand, Fragrance, Type, Volume, Price, Stock and Left rows. Buyer rows are never sent, and the sheet stays private.

## One-time setup (about 5 minutes)

### 1. Add the feed to the sheet
1. Open the inventory spreadsheet, then go to **Extensions → Apps Script**.
2. Delete what's in `Code.gs`, and paste in the contents of `apps-script/Code.gs`. Save.
3. Click **Deploy → New deployment**. Click the gear, choose **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**, then **Authorize access** and allow it. Google shows an "unverified app" warning because it's your own script: click **Advanced**, then **Go to …**.
5. Copy the **Web app URL**. It ends in `/exec`.

Check it: open that URL in a browser. You should see product rows only, with no buyer names.

"Anyone" means anyone who has this URL can see the product rows (names, prices and stock), which are the same things the website shows. It never exposes the rest of the sheet.

### 2. Point the site at it
In `index.html`, set:
```js
const LIVE_URL = "https://script.google.com/macros/s/…/exec";
const TAB = "Sept-Oct";
```

### 3. Publish on GitHub Pages
Push this folder to a GitHub repo. Then go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
The site is at `https://<your-username>.github.io/<repo-name>/`.

## Day to day
- **Stock or price changes:** there's nothing to do. Edit the sheet, and the site shows the change within a minute.
- **New tab (e.g. Nov-Dec):** change `TAB` in `index.html` and push. If you set `TAB = ""`, the site always reads the first tab.
- **Editing the Apps Script later:** go to **Deploy → Manage deployments → Edit**, and set **Version: New version**, so the URL stays the same.
- **No connection:** the page shows the last stock it received, marked "Offline".

## Sheet layout the feed expects
Each column is one product. Column A holds the row labels `Fragrance`, `Type`, `Volume`, `Price`, `Stock`, `Left`.
The brand is in the row above `Fragrance`, and it can be merged across its products.

## Tips
- Link straight to a search: `.../?q=dior sauvage`
- "Left" is shown in green, orange (2 or fewer) or red (0 or less).
