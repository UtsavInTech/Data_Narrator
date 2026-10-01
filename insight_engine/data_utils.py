import pandas as pd

def load_and_clean_data(file):
    """
    Reads uploaded CSV/Excel file into a Pandas DataFrame
    and does basic cleaning.
    """
    try:
        if file.name.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
    except Exception as e:
        raise ValueError(f"Error reading file: {e}")

    # Basic cleaning
    df.columns = df.columns.str.strip()  # remove spaces in column names
    df = df.dropna(how='all')  # drop empty rows

    return df


def aggregate_sales(df):
    """
    Aggregates Amount and Profit by Category/Sub-Category.
    """
    if "Category" in df.columns and "Amount" in df.columns:
        sales_by_cat = df.groupby("Category")["Amount"].sum().reset_index()
    else:
        sales_by_cat = pd.DataFrame()

    if "Sub-Category" in df.columns and "Profit" in df.columns:
        profit_by_sub = df.groupby("Sub-Category")["Profit"].sum().reset_index()
    else:
        profit_by_sub = pd.DataFrame()

    return sales_by_cat, profit_by_sub