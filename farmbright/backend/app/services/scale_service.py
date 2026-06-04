import time


class ScaleService:
    VENDOR_ID = 0x0922
    PRODUCT_ID = 0x8003

    def __init__(self):
        self.device = None

    def connect(self):
        if self.device is not None:
            return True

        try:
            import hid

            device = hid.device()
            device.open(self.VENDOR_ID, self.PRODUCT_ID)
            device.set_nonblocking(False)
            self.device = device
            return True
        except Exception:
            self.device = None
            return False

    def disconnect(self):
        try:
            if self.device is not None:
                self.device.close()
        except Exception:
            pass
        finally:
            self.device = None

    def is_connected(self):
        return self.device is not None

    def get_reading(self):
        if self.device is None and not self.connect():
            return self._error_reading()

        try:
            packet = self.device.read(8, 500)
            if not packet or len(packet) < 6:
                return self._error_reading(connected=True)

            stable = bool(packet[1] & 0b00000100)
            negative = bool(packet[1] & 0b00100000)
            unit_code = packet[2]
            exponent = packet[3] if packet[3] < 128 else packet[3] - 256
            raw_value = packet[4] + (packet[5] << 8)
            scaled_value = raw_value * (10**exponent)

            if unit_code == 2:
                weight_lbs = scaled_value / 453.592
                unit = "grams"
            elif unit_code == 11:
                weight_lbs = scaled_value / 16
                unit = "ounces"
            elif unit_code == 12:
                weight_lbs = scaled_value
                unit = "lbs"
            else:
                weight_lbs = scaled_value
                unit = "lbs"

            if negative:
                weight_lbs *= -1

            return {
                "weight_lbs": round(float(weight_lbs), 3),
                "stable": stable,
                "unit": unit,
                "connected": True,
            }
        except Exception:
            self.disconnect()
            return self._error_reading()

    def get_stable_reading(self, timeout_seconds=10):
        deadline = time.monotonic() + timeout_seconds
        last_reading = self._error_reading()

        while time.monotonic() < deadline:
            last_reading = self.get_reading()
            if last_reading.get("stable"):
                return {**last_reading, "timed_out": False}
            time.sleep(0.25)

        return {**last_reading, "timed_out": True}

    def _error_reading(self, connected=False):
        return {
            "weight_lbs": 0.0,
            "stable": False,
            "unit": "lbs",
            "connected": connected,
        }


scale = ScaleService()


def detect_scale():
    return scale.is_connected()
