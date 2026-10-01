from deep_translator import GoogleTranslator
import streamlit as st
from insight_engine.data_utils import load_and_clean_data
from insight_engine.insight_utils import generate_basic_insights, generate_chart_commentary
from narrations.narration_engine import generate_narration
from charts.charts import plot_sales_by_category, plot_profit_by_subcategory

st.markdown(
    """
    <style>
    .main {
        background-color: #f8f9fc;
        font-family: "Segoe UI", sans-serif;
    }
    /* Top Navbar */
    .top-navbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #4a47a3;
        color: white;
        padding: 15px 30px;
        border-radius: 5px;
        margin-bottom: 20px;
    }
    .top-navbar h2 {
        margin: 0;
        font-size: 22px;
        font-weight: bold;
    }
    .top-navbar p {
        margin: 0;
        font-size: 16px;
        font-style: italic;
    }
    /* Title Banner */
    .title-banner {
        text-align: center;
        background: linear-gradient(90deg, #6a11cb, #2575fc);
        color: white;
        padding: 30px 20px;
        border-radius: 10px;
        margin-bottom: 25px;
    }
    .title-banner h1 {
        font-size: 34px;
        font-weight: bold;
        margin-bottom: 10px;
    }
    .title-banner p {
        font-size: 16px;
        margin-bottom: 15px;
    }
    .feature-badges span {
        background-color: white;
        color: black;
        font-weight: bold;
        padding: 8px 14px;
        border-radius: 20px;
        margin: 0 5px;
        display: inline-block;
        font-size: 14px;
    }
    /* Strengths Section */
    .strengths-card {
        background: white;
        padding: 25px;
        border-radius: 10px;
        border: 1px solid #ddd;
        margin-bottom: 25px;
    }
    .strengths-card h3 {
        color: #4a47a3;
        font-size: 20px;
        margin-bottom: 15px;
    }
    .strengths-card ul {
        font-size: 15px;
        line-height: 1.6;
        padding-left: 20px;
    }
    .strengths-card p {
        font-size: 14px;
        margin-top: 10px;
    }
    </style>
    """,
    unsafe_allow_html=True
)

# ==============================
# Top Navbar
# ==============================
st.markdown(
    """
    <div class="top-navbar">
        <h2>DataNarrator</h2>
        <p>Your AI Analyst</p>
    </div>
    """,
    unsafe_allow_html=True
)

# ==============================
# Banner Section (Image 2 style)
# ==============================
st.markdown(
    """
    <div class="title-banner">
        <h1>Turn Your Data Into Stories</h1>
        <p>Upload your data and let AI create simple, engaging narratives that anyone can understand.</p>
        <div class="feature-badges">
            <span>AI-Powered</span>
            <span>Voice-First</span>
            <span>Mobile-Friendly</span>
        </div>
    </div>
    """,
    unsafe_allow_html=True
)

# ==============================
# Our Strengths Section (Image 1 content)
# ==============================
st.markdown(
    """
    <div class="strengths-card">
        <h3>Our Strengths</h3>
        <ul>
            <li><b>Automated Insights</b> – Quick summaries from raw data.</li>
            <li><b>Storytelling</b> – Turns numbers into simple, human-like narratives.</li>
            <li><b>Multilingual Support</b> – Narratives in English, Hindi, Bengali, Tamil, Telugu.</li>
        </ul>
        <p><b>Mission:</b> Democratize data analysis for everyone.<br>
        <b>Vision:</b> Make every dataset speak like a human analyst.</p>
    </div>
    """,
    unsafe_allow_html=True
)

# ==============================
# Upload Section
# ==============================
uploaded_file = st.file_uploader("📤 Upload Your Data (CSV/XLSX)", type=["csv", "xlsx"])

if uploaded_file is not None:
    # Step 2: Load + clean
    df = load_and_clean_data(uploaded_file)
    st.write("### Data Preview", df.head())

    # Step 3: Insights
    insights = generate_basic_insights(df)

    # Step 4: Narration with Multilingual Support
    narration = generate_narration(insights)
    st.write("### Insights")

    # Language selection
    lang_map = {
        "English": "en",
        "हिंदी (Hindi)": "hi",
        "বাংলা (Bengali)": "bn",
        "தமிழ் (Tamil)": "ta",
        "తెలుగు (Telugu)": "te"
    }

    lang_choice = st.selectbox(
        "Choose output language:",
        list(lang_map.keys()),  # show full names
        index=0
    )

    selected_lang = lang_map[lang_choice]  # get language code

    # Translate narration if not English
    if selected_lang != "en":
        try:
            translated = GoogleTranslator(source="en", target=selected_lang).translate(narration)
            st.text(translated)
        except Exception as e:
            st.error(f"Translation failed: {e}")
    else:
        st.text(narration)

    # Step 5: Charts
    sales_chart = plot_sales_by_category(df)
    profit_chart = plot_profit_by_subcategory(df)

    if sales_chart:
        st.image(sales_chart, caption="Sales by Category")
    if profit_chart:
        st.image(profit_chart, caption="Profit by Sub-Category")

    # Step 6: Chart Commentary
    chart_comments = generate_chart_commentary(df)
    if chart_comments:
        st.write("### Chart Commentary")
        for c in chart_comments:
            if selected_lang != "en":
                try:
                    translated_c = GoogleTranslator(source="en", target=selected_lang).translate(c)
                    st.write("- " + translated_c)
                except Exception:
                    st.write("- " + c)
            else:
                st.write("- " + c)

    # Step 7: Download Report
    report_content = "### Insights\n"
    report_content += "\n".join(insights) + "\n\n"

    report_content += "### Chart Commentary\n"
    if chart_comments:
        for c in chart_comments:
            report_content += "- " + c + "\n"

    st.download_button(
        label="📥 Download Report",
        data=report_content,
        file_name="insights_report.txt",
        mime="text/plain"
    )