import base64
import io
import logging
from typing import Optional

import crcmod
import qrcode

logger = logging.getLogger(__name__)


def _format_field(id_code: str, value: str) -> str:
    """Format an EMV field: ID + length(2 digits) + value."""
    return f"{id_code}{len(value):02}{value}"


def _calculate_crc16(payload: str) -> str:
    """Calculate CRC16-CCITT for the BR Code payload.

    Uses polynomial 0x11021, init 0xFFFF, no XOR out.
    """
    crc16_func = crcmod.mkCrcFun(0x11021, initCrc=0xFFFF, rev=False, xorOut=0x0000)
    crc = hex(crc16_func(payload.encode("utf-8")))[2:].upper().zfill(4)
    return crc


def generate_pix_copy_paste(
    key: str,
    name: str,
    city: str,
    amount: float,
    txid: str = "***",
    merchant_category: str = "0000",
    country_code: str = "BR",
    currency: str = "986",
) -> str:
    """Generate a PIX Copy & Paste string (BR Code) following EMV specifications.

    Args:
        key: PIX key (CPF, email, phone, or random key).
        name: Receiver/merchant name (max 25 chars, truncated if longer).
        city: Receiver/merchant city (max 15 chars, truncated if longer).
        amount: Transaction amount in BRL (e.g. 50.00).
        txid: Transaction identifier (default "***").
        merchant_category: MCC code (default "0000" = unspecified).
        country_code: Country code (default "BR").
        currency: Currency code (default "986" = BRL).

    Returns:
        The complete BR Code string ready for Copy & Paste.
    """
    payload = ""

    # 00 - Payload Format Indicator (fixed "01")
    payload += _format_field("00", "01")

    # 26 - Merchant Account Information
    #   00 - GUI (br.gov.bcb.pix)
    #   01 - PIX Key
    merchant_account = _format_field("00", "br.gov.bcb.pix") + _format_field("01", key)
    payload += _format_field("26", merchant_account)

    # 52 - Merchant Category Code
    payload += _format_field("52", merchant_category)

    # 53 - Transaction Currency
    payload += _format_field("53", currency)

    # 54 - Transaction Amount (optional, omit if 0)
    if amount > 0:
        payload += _format_field("54", f"{amount:.2f}")

    # 58 - Country Code
    payload += _format_field("58", country_code)

    # 59 - Merchant Name (truncated to 25 chars)
    payload += _format_field("59", name[:25])

    # 60 - Merchant City (truncated to 15 chars)
    payload += _format_field("60", city[:15])

    # 62 - Additional Data Field Template
    #   05 - Reference Label (Transaction ID, max 25 chars)
    additional_data = _format_field("05", txid[:25])
    payload += _format_field("62", additional_data)

    # 63 - CRC16 placeholder (6304)
    payload += "6304"

    # Calculate CRC16 over the entire payload
    crc = _calculate_crc16(payload)

    return f"{payload}{crc}"


def generate_pix_qrcode(
    key: str,
    name: str,
    city: str,
    amount: float,
    txid: str = "***",
    box_size: int = 10,
    border: int = 4,
) -> str:
    """Generate a PIX QR code as a base64-encoded PNG image.

    Args:
        key: PIX key.
        name: Receiver/merchant name.
        city: Receiver/merchant city.
        amount: Transaction amount in BRL.
        txid: Transaction identifier.
        box_size: QR code box size in pixels.
        border: QR code border width in boxes.

    Returns:
        Base64-encoded PNG image string (data URI format).
    """
    # Generate the BR Code string
    br_code = generate_pix_copy_paste(
        key=key,
        name=name,
        city=city,
        amount=amount,
        txid=txid,
    )

    # Generate QR code image
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(br_code)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # Convert to base64 PNG
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return f"data:image/png;base64,{img_base64}"


def parse_pix_code(br_code: str) -> Optional[dict]:
    """Parse a BR Code string into its constituent fields.

    Args:
        br_code: The BR Code (PIX Copy & Paste) string.

    Returns:
        Dictionary with parsed fields, or None if invalid.
    """
    try:
        result = {}
        pos = 0
        while pos < len(br_code):
            if pos + 4 > len(br_code):
                break
            field_id = br_code[pos : pos + 2]
            length_str = br_code[pos + 2 : pos + 4]
            if not length_str.isdigit():
                break
            length = int(length_str)
            pos += 4
            if pos + length > len(br_code):
                break
            value = br_code[pos : pos + length]
            pos += length
            result[field_id] = value

            # Stop at CRC field
            if field_id == "63":
                break

        return result if result else None
    except Exception:
        logger.exception("Failed to parse BR Code")
        return None
