import re

ABV_TOLERANCE = 0.1
NET_CONTENTS_TOLERANCE_ML = 1.0
US_FLUID_OUNCE_ML = 29.5735295625

_NON_ALPHANUMERIC_RE = re.compile(r"[^a-z0-9]+")
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_PROOF_RE = re.compile(r"(\d+(?:\.\d+)?)\s*proof", re.IGNORECASE)
_NET_CONTENTS_RE = re.compile(
    r"(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>fl\.?\s*oz\.?|fluid\s+ounces?|ml|milliliters?|millilitres?|l|liters?|litres?|cl|centiliters?|centilitres?)\b",
    re.IGNORECASE,
)

_US_STATE_NAMES = frozenset(
    {
        "alabama",
        "alaska",
        "arizona",
        "arkansas",
        "california",
        "colorado",
        "connecticut",
        "delaware",
        "district of columbia",
        "florida",
        "georgia",
        "hawaii",
        "idaho",
        "illinois",
        "indiana",
        "iowa",
        "kansas",
        "kentucky",
        "louisiana",
        "maine",
        "maryland",
        "massachusetts",
        "michigan",
        "minnesota",
        "mississippi",
        "missouri",
        "montana",
        "nebraska",
        "nevada",
        "new hampshire",
        "new jersey",
        "new mexico",
        "new york",
        "north carolina",
        "north dakota",
        "ohio",
        "oklahoma",
        "oregon",
        "pennsylvania",
        "rhode island",
        "south carolina",
        "south dakota",
        "tennessee",
        "texas",
        "utah",
        "vermont",
        "virginia",
        "washington",
        "west virginia",
        "wisconsin",
        "wyoming",
    }
)
_US_STATE_CODES = (
    "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|"
    "MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|"
    "WV|WI|WY"
)
_US_STATE_CODE_RE = re.compile(
    rf"\b(?:{_US_STATE_CODES})\b(?=(?:\s*,)?\s*(?:\d{{5}}(?:-\d{{4}})?)?\s*$)"
)

_COUNTRY_SYNONYMS = {
    "usa": "united states",
    "u s a": "united states",
    "us": "united states",
    "u s": "united states",
    "united states": "united states",
    "united states of america": "united states",
}


def collapse_whitespace(value: str) -> str:
    return " ".join(value.split())


def normalize_for_fuzzy(value: str) -> str:
    lower_value = value.lower()
    without_punctuation = _NON_ALPHANUMERIC_RE.sub(" ", lower_value)
    return collapse_whitespace(without_punctuation)


def normalize_country(value: str) -> str:
    normalized = normalize_for_fuzzy(value)
    return _COUNTRY_SYNONYMS.get(normalized, normalized)


def has_us_state_reference(value: str) -> bool:
    normalized = f" {normalize_for_fuzzy(value)} "
    if any(f" {state} " in normalized for state in _US_STATE_NAMES):
        return True
    return _US_STATE_CODE_RE.search(value) is not None


def parse_abv(value: str) -> float | None:
    percent_match = _PERCENT_RE.search(value)
    if percent_match:
        return float(percent_match.group(1))

    proof_match = _PROOF_RE.search(value)
    if proof_match:
        return float(proof_match.group(1)) / 2

    return None


def parse_net_contents_ml(value: str) -> float | None:
    match = _NET_CONTENTS_RE.search(value)
    if not match:
        return None

    amount = float(match.group("amount"))
    unit = match.group("unit").lower()

    if unit in {"ml", "milliliter", "milliliters", "millilitre", "millilitres"}:
        return amount
    if unit in {"l", "liter", "liters", "litre", "litres"}:
        return amount * 1000
    if unit in {"cl", "centiliter", "centiliters", "centilitre", "centilitres"}:
        return amount * 10
    if unit.replace(".", "").replace(" ", "") in {"floz", "fluidounce", "fluidounces"}:
        return amount * US_FLUID_OUNCE_ML

    return None
