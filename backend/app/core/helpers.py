from app.core.database import get_rounds_data, get_totals_data
from app.core.socket import emit_sync


def push_state(code: str, room_id: int) -> None:
    rounds = get_rounds_data(room_id)
    totals = get_totals_data(room_id)
    emit_sync("state_update", {"rounds": rounds, "totals": totals}, room=code.upper())
