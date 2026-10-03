# Contributing to Data Narrator

Thanks for wanting to help. Data Narrator turns messy business data into plain-language reports and runs the daily MIS work for companies that don't have a BI team. Every contribution makes that a little more true, whether it's a fixed sentence, a test, a translation or a new connector.

## Ways to help

You don't have to write code to make a real difference.

- **Send a messy file.** A real-world Excel sheet (with private data removed or replaced) that Data Narrator reads badly is one of the most valuable things you can give us. Open an issue, attach the file, and say what you expected.
- **Report a wrong or silly sentence.** If a generated story says something untrue or odd, such as adding up prices or calling a fall in returns bad news, open an issue with the sentence and, if you can, the file that produced it.
- **Improve the words.** The app speaks in plain English for business owners. Clearer wording in the interface or the generated stories is always welcome.
- **Translate the narration.** Hindi, Tamil, Telugu, Bengali, Marathi and others are on the roadmap.
- **Write code.** Fix a bug, add a test, build a connector, or pick something from the [roadmap](README.md#roadmap).

Look for issues labelled **good first issue** if you're new, or **help wanted** for bigger pieces.

## Setting up

You need Python 3.11 or newer and Node.js 20 or newer.

```bash
git clone https://github.com/UtsavInTech/Data_Narrator.git
cd Data_Narrator

# backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn datanarrator.api.main:app --reload       # http://localhost:8000

# frontend, in a second terminal
cd frontend
npm install
npm run dev                                      # http://localhost:5173, proxies /api to :8000
```

Open http://localhost:5173. The three sample companies load in the background on startup, so within a minute you can click **Try a sample company** and explore as an admin, a manager or a data entry clerk. Your own test data goes in a separate workspace: create the first admin account on the login page.

To start from a clean slate, stop the backend and delete `backend/storage/`.

## Where things live

```
backend/datanarrator/
  connectors/     reading Excel, CSV, cloud links and databases; cleaning ₹, dates, subtotals
  engine/         understanding the data and writing about it
    profile.py        a role for every column (amount, category, date, name, ID, property)
    relationships.py  automatic joins on shared keys
    insights.py       trends, breakdowns, top performers, unusual values, data problems
    narrate.py        the written story, overdue money, groups that drifted
    actions.py        the "act on today" rules
    fmt.py            ₹ lakh and crore, percentages, plurals
  mis/            entry forms, sign-off, daily reports, schedules, Excel templates
  brief.py        the morning brief and its delivery by email and WhatsApp
  demos/          the three sample companies and their data generators
  api/main.py     the HTTP API
frontend/src/
  pages/          one file per screen
  components/     the shell, charts, the story, shared UI
  index.css       design tokens: colours, fonts
backend/tests/    pytest suite
```

A good first read is `engine/profile.py` then `engine/narrate.py`: together they show how a column becomes a sentence.

## Making a change

1. **Open an issue first for anything bigger than a small fix**, so we can agree on the approach before you spend time on it.
2. **Fork, then branch** from `main` with a short descriptive name, such as `fix-gst-rounding` or `tally-connector`.
3. **Keep the change focused.** One pull request, one idea. Unrelated clean-ups belong in their own PR.
4. **Add or update tests.** Every engine change needs a test that would have failed before it. If you fixed how a file is read, add a small version of that file's shape to the tests.
5. **Run the checks** before you push:

   ```bash
   cd backend && pytest                 # all tests must pass
   cd frontend && npm run build         # typechecks and builds
   ```

6. **Open the pull request** with what changed, why, and how you checked it. Add a screenshot for anything visible.

## Guidelines

**The engine must stay schema-agnostic.** Data Narrator works on files it has never seen. Never special-case a column name from one company's data. Decide from the values and from general patterns (a column name containing "limit" is a property, not an amount), and make sure the rule holds for other industries too.

**Every sentence must be true and useful.** A wrong or silly line costs an owner's trust faster than anything else. Prefer saying nothing over saying something doubtful. Check new wording against all three sample companies: run the backend, open each one, and read what it says.

**Write for a business owner, not an analyst.** Plain words, short sentences, Indian number style (₹4.5 lakh, ₹1.2 crore). No jargon such as "dimension", "measure", "null" or "aggregate" in anything a user reads.

**Match the code around you.** Keep comments as sparse and to the point as the surrounding code, use the same naming, and don't add a new library when the standard one or an existing dependency will do.

**Keep the design system.** Colours, fonts and spacing come from the tokens in `frontend/src/index.css`. The serif is for headlines and the written story; everything you operate uses IBM Plex Sans. Colour only carries meaning: green good, amber watch, red act, marigold for "you are here" and the brief. Check your change at phone width too.

**Never commit real data.** No customer files, credentials or `.env` files. Sample data comes from the generators in `backend/datanarrator/demos/`.

## Adding a sample company

Sample companies show what Data Narrator can do in a new industry. To add one:

1. Write a generator in `backend/datanarrator/demos/` that returns a dict of table name to pandas DataFrame, ending on the given day. Look at `dairy.py` for the pattern.
2. Plant a few real patterns an MIS person would want caught: seasonality, a group slipping, late payers, a data mistake or two. Document them in the module docstring.
3. Register it in `demos/__init__.py` with a name, an industry, a place, and three accounts (admin, manager, data entry).
4. Open it in the app as each role, read every story, and fix anything that reads wrong, in the engine if the problem is general.
5. Add it to the tests in `backend/tests/test_demos.py`.

Use made-up company names. Don't use real companies' names or branding.

## Reporting bugs

Open an issue with:

- what you did, what you expected, and what happened instead
- the error message or a screenshot
- if it's about reading or analysing data, a small file that shows the problem (private data removed)
- your setup: Docker or from source, operating system, browser

**Security problems:** please don't open a public issue. Email the maintainer at the address on the GitHub profile, and allow time for a fix before disclosing.

## Code of conduct

Be kind and assume good intent. Critique the code, not the person. Harassment or discrimination of any kind isn't tolerated, and maintainers may remove comments or contributors who don't follow this.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
