# Pageant Tabulation

A browser-based tabulation system. Judges score from their own phones or laptops, and totals, averages, ranks, overall standings and special awards update live for everyone.

Criteria, weights and formulas follow `TABULATION.xlsx`:

| Result | Formula |
|---|---|
| Judge total | `SUM(criteria)` (each criterion's maximum is its weight, so totals are out of 100) |
| Category average | `AVERAGE(all judges' totals)` |
| Category rank | `RANK.EQ(average, all averages, 0)`: highest average ranks 1, ties share a rank |
| Overall | rank of `AVERAGE(the 3 category ranks)`, lowest first; ties go to the higher average score |
| Special awards | the rank-1 candidate in each category |

## Files

- `index.html`: the page
- `app.js`: scoring logic and live sync
- `firebase-config.js`: your Firebase settings (paste them in, step 1)
- `firestore.rules`: database security rules (step 1)

Without Firebase settings the site still works, but only on one device: scores are saved in that browser.

## 1. Set up the free online database (Firebase, about 10 minutes)

1. Go to https://console.firebase.google.com and sign in with a Google account. Click **Create a project** and name it, e.g. `pageant-tabulation`. You can turn Google Analytics off.
2. **Build > Authentication > Get started > Sign-in method**: enable **Anonymous**.
3. **Build > Firestore Database > Create database**: choose a location near you (e.g. `asia-southeast1`), start in **production mode**.
4. In Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
5. **Project settings** (gear icon) > **Your apps** > click the web icon `</>` and register an app (no hosting needed). Copy the `firebaseConfig` values into `firebase-config.js`.
6. **Authentication > Settings > Authorized domains**: add `YOUR-GITHUB-USERNAME.github.io`.

## 2. Publish on GitHub Pages

1. Create a free account at https://github.com, then create a **new public repository** named `tabulation` (leave it empty).
2. In Terminal, from this `site` folder:

```bash
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/tabulation.git
git push -u origin main
```

3. In the repository on GitHub: **Settings > Pages > Build and deployment**: Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, **Save**.
4. After a minute the site is live at `https://YOUR-GITHUB-USERNAME.github.io/tabulation/`.

After editing a file later, publish the change with:

```bash
git add -A && git commit -m "Update" && git push
```

## 3. Run the event

1. **Organizer:** open the site, choose **Create a new event**, enter the title and a PIN. Then in **Setup**, set the judge names, number of candidates and (optionally) candidate names.
2. Copy the share link from **Setup** and send it to the judges. It contains the 8-character event code.
3. **Judges:** open the link, tap their own name under **Judge**, choose a category and type scores. Scores save automatically.
4. Everyone can watch **Category Results** and **Overall & Awards** update live. Use **Print** or **Export results (CSV)** at the end.

## Security notes

- The event code is the key to an event: anyone with the link can view and enter scores, so only share it with your judges and tabulators.
- The organizer PIN locks the Setup tab in the page. It keeps judges from changing the setup by accident, but it is not a hard security barrier.
- Firebase's free Spark plan is far more than enough for an event of this size.
