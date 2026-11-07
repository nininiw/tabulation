# Power Dressing Icon 2026 · Tabulation

A browser-based tabulation system with two pages:

- **Admin** (`admin.html`): create the event, set judges and contestants, watch every judge's scores live, see the computation, and get the winners.
- **Judge** (`index.html`): each judge gets their own link and sees only their own scoresheet. No results or rankings are shown to judges.

Live site: https://nininiw.github.io/tabulation/ (judges) and https://nininiw.github.io/tabulation/admin.html (admin)

## Criteria for Judging

The admin can add, rename, re-weight or remove criteria for each event in **Event Setup → Criteria for judging**. Judges' scoresheets update live. **Restore CDAP criteria** brings back the defaults below, which are used for both rounds, **School Uniform** and **Corporate Attire**, in the Male and Female categories:

| Criterion | Weight (max points) |
|---|---|
| Presentation (Poise, Bearing and Confidence) | 40% |
| Appropriateness of the Outfit | 30% |
| Attention to Details (make-up, shoes, accessories) | 30% |
| **Total** | **100%** |

## Computation (from `TABULATION.xlsx`)

| Result | Formula |
|---|---|
| Judge total | `SUM(criteria)`, out of 100 |
| Round average | `AVERAGE(all judges' totals)` |
| Round rank | `RANK.EQ(average, all averages, 0)`: highest average ranks 1, ties share a rank |
| Overall | rank of `AVERAGE(School Uniform rank, Corporate Attire rank)`, lowest first; a tie goes to the higher average score across both rounds |

**Winners (Male & Female):** Power Dressing Icon 2026 (overall 1st), 1st Runner-up (2nd), 2nd Runner-up (3rd).
**Special citations (Male & Female):** Best in School Uniform and Best in Corporate Attire (rank 1 in that round).

## Files

- `index.html` + `judge.js`: judge page
- `admin.html` + `admin.js`: admin page
- `core.js`: criteria, formulas and live sync shared by both pages
- `style.css`: look and colors (#4f2b48 plum, #023c6e navy)
- `firebase-config.js`: Firebase settings
- `firestore.rules`: database security rules (paste into Firebase > Firestore > Rules)

## Run the event

1. **Admin:** open `admin.html`, choose **Create a new event**, enter the title and an admin PIN.
2. In **Event Setup**, type the judges' names and the number and names of the contestants.
3. Click **Copy link** beside each judge and send that judge their own link.
4. **Judges:** open their link, choose **School Uniform** or **Corporate Attire**, and type scores. Scores save automatically.
5. **Admin:** watch **Judges' Scores** (progress and each judge's sheet), **Computation**, and **Winners** update live. Use **Print** or **Export results (CSV)** at the end.

To open the admin page on another device, choose **Open an existing event** and enter the event code and PIN.

## Publishing changes

After editing a file, from this folder:

```bash
git add -A && git commit -m "Update" && git push
```

When you change `core.js`, `judge.js`, `admin.js` or `style.css`, raise the `?v=` number on their links in `index.html` and `admin.html` so phones load the new version.

## Security notes

- Anyone with a judge link can enter scores for that event, so send each link only to that judge.
- The judge page doesn't show other judges' scores or results, but the event data isn't locked per judge. Someone technical with the event code could still read it.
- The admin PIN protects the admin page from casual access. It is not a hard security barrier.
