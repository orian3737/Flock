DYMO_VENDOR_ID = 0x0922


def detect_scale():
    try:
        import hid
    except ImportError:
        return False

    try:
        devices = hid.enumerate()
    except Exception:
        return False

    return any(device.get("vendor_id") == DYMO_VENDOR_ID for device in devices)
