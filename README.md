# 488_Capstone_Text_Classifier

An end-to-end text classification pipeline designed for real-world business applications. This project compares GenAI-based labeling with a fine-tuned specialist model to transform unstructured text (reviews, filings, reports) into reliable, actionable insights.

## CFPB mortgage dataset (CSV)

Complaints are downloaded from the public **Consumer Financial Protection Bureau (CFPB) Consumer Complaint Database** search API:

`https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/`

The export notebook applies these filters:

- **Product:** Mortgage  
- **Narrative:** `has_narrative=true` (consumer-submitted narrative text present)  
- **Consent:** `consumer_consent_provided=Consent provided`  
- **Date received:** `2025-01-01` inclusive through **before** `2026-03-01` (calendar year 2025; `date_received_max` is exclusive in the API)

### Output file

| Item | Value |
|------|--------|
| Path | `data/mortgage_2025_narrative_consent.csv` |
| Encoding | UTF-8 |
| Row count | **15,755** complaint rows (plus one header row) |

**Note:** `complaint_what_happened` often contains newlines. The file may have **many more physical lines** than 15,755; row count should be checked with a CSV-aware tool (Python `csv` module, pandas, etc.), not `wc -l`.

### Columns

| Column | Description |
|--------|-------------|
| `complaint_id` | CFPB complaint identifier |
| `date_received` | Date (and time zone) the complaint was received |
| `issue` | High-level issue category |
| `sub_issue` | More specific issue (may be empty for some complaints) |
| `complaint_what_happened` | Consumer narrative text (primary text field for modeling) |

## Running `data.ipynb`

1. Open the project folder in JupyterLab, Jupyter Notebook, or VS Code’s notebook UI.  
2. Open `data.ipynb`.  
3. **Run the first code cell** to call the API and write `data/mortgage_2025_narrative_consent.csv`.  
   - Uses Python’s standard library only (`urllib`, `json`, `csv`).  
   - Requires **internet access** and may take on the order of **minutes** (large JSON payload, ~tens of MB).  
4. Run the remaining cells **in order** to load the CSV with **pandas** and explore (`head()`, counts, etc.).  
   - Install pandas if needed: `pip install pandas` (or use an environment such as Anaconda where pandas is already available).

To refresh the CSV after a policy or filter change, re-run the first cell (it overwrites the file).
