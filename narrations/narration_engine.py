def generate_narration(insights):
    """
    Convert list of insights into a narrative paragraph.
    For demo: rule-based, no GPT.
    """
    if not insights:
        return "No insights available for this dataset."

    narrative = "Here are some key highlights from your sales data:\n"
    for point in insights:
        narrative += f"- {point}\n"
    return narrative