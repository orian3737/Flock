from collections import defaultdict
from datetime import date, timedelta

from app.extensions import db
from app.models import AnimalClass, FeedingEvent, Flock, ProductionLog, Revenue


def get_farm_summary(user_id, start_date, end_date):
    flocks = _user_flocks(user_id)
    flock_ids = [flock.id for flock in flocks]
    feeding_events = _feeding_events(flock_ids, start_date, end_date)
    revenues = _revenues(user_id, start_date, end_date)

    feed_cost_by_day = defaultdict(float)
    feed_cost_by_flock = defaultdict(float)
    for event in feeding_events:
        feed_cost_by_day[event.date] += event.cost_total
        feed_cost_by_flock[event.flock_id] += event.cost_total

    revenue_by_day = defaultdict(float)
    for revenue in revenues:
        revenue_by_day[revenue.date] += revenue.amount

    total_feed_cost = sum(feed_cost_by_day.values())
    total_revenue = sum(revenue.amount for revenue in revenues)
    top_flock_id = max(feed_cost_by_flock, key=feed_cost_by_flock.get, default=None)
    top_flock = next((flock for flock in flocks if flock.id == top_flock_id), None)

    return {
        "total_feed_cost": round(total_feed_cost, 2),
        "total_revenue": round(total_revenue, 2),
        "net_pl": round(total_revenue - total_feed_cost, 2),
        "feed_cost_by_day": [
            {
                "date": day.isoformat(),
                "cost": round(feed_cost_by_day[day], 2),
                "revenue": round(revenue_by_day[day], 2),
                "net": round(revenue_by_day[day] - feed_cost_by_day[day], 2),
            }
            for day in _date_range(start_date, end_date)
        ],
        "top_cost_flock": {
            "name": top_flock.name if top_flock else None,
            "cost": round(feed_cost_by_flock[top_flock_id], 2) if top_flock_id else 0.0,
        },
    }


def get_flock_pl(flock_id, start_date, end_date):
    flock = db.session.get(Flock, flock_id)
    if not flock:
        return None

    feeding_events = _feeding_events([flock_id], start_date, end_date)
    revenues = Revenue.query.filter(
        Revenue.flock_id == flock_id,
        Revenue.date >= start_date,
        Revenue.date <= end_date,
    ).all()
    production_logs = ProductionLog.query.filter(
        ProductionLog.flock_id == flock_id,
        ProductionLog.date >= start_date,
        ProductionLog.date <= end_date,
    ).all()

    feed_by_day = defaultdict(float)
    revenue_by_day = defaultdict(float)
    for event in feeding_events:
        feed_by_day[event.date] += event.cost_total
    for revenue in revenues:
        revenue_by_day[revenue.date] += revenue.amount

    total_feed_cost = sum(feed_by_day.values())
    total_revenue = sum(revenue.amount for revenue in revenues)
    total_eggs = sum(log.egg_count or 0 for log in production_logs)
    headcount = flock.current_headcount or 0
    cost_per_dozen = (total_feed_cost / total_eggs * 12) if total_eggs else None

    return {
        "flock_id": flock.id,
        "name": flock.name,
        "breed_name": flock.breed.name if flock.breed else "",
        "designation": flock.designation,
        "headcount": headcount,
        "total_feed_cost": round(total_feed_cost, 2),
        "total_revenue": round(total_revenue, 2),
        "net_pl": round(total_revenue - total_feed_cost, 2),
        "cost_per_bird": round(total_feed_cost / headcount, 3) if headcount else 0.0,
        "cost_per_dozen": round(cost_per_dozen, 2) if cost_per_dozen is not None else None,
        "daily_breakdown": [
            {
                "date": day.isoformat(),
                "feed_cost": round(feed_by_day[day], 2),
                "revenue": round(revenue_by_day[day], 2),
                "net": round(revenue_by_day[day] - feed_by_day[day], 2),
            }
            for day in _date_range(start_date, end_date)
        ],
    }


def get_user_flock_pl(user_id, start_date, end_date):
    return [
        get_flock_pl(flock.id, start_date, end_date)
        for flock in _user_flocks(user_id)
    ]


def _user_flocks(user_id):
    return (
        Flock.query.join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id)
        .order_by(Flock.name)
        .all()
    )


def _feeding_events(flock_ids, start_date, end_date):
    if not flock_ids:
        return []
    return FeedingEvent.query.filter(
        FeedingEvent.flock_id.in_(flock_ids),
        FeedingEvent.date >= start_date,
        FeedingEvent.date <= end_date,
    ).all()


def _revenues(user_id, start_date, end_date):
    return Revenue.query.filter(
        Revenue.user_id == user_id,
        Revenue.date >= start_date,
        Revenue.date <= end_date,
    ).all()


def _date_range(start_date, end_date):
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def current_month_range():
    today = date.today()
    start_date = today.replace(day=1)
    if today.month == 12:
        next_month = today.replace(year=today.year + 1, month=1, day=1)
    else:
        next_month = today.replace(month=today.month + 1, day=1)
    return start_date, next_month - timedelta(days=1)


def aggregate_daily_financials(app):
    """Create or update yesterday's FinancialRecord rows for active flocks."""
    with app.app_context():
        from app.models.financial_record import FinancialRecord

        yesterday = date.today() - timedelta(days=1)
        flock_ids = [
            row[0]
            for row in db.session.query(FeedingEvent.flock_id)
            .filter(FeedingEvent.date == yesterday)
            .distinct()
            .all()
        ]

        for flock_id in flock_ids:
            events = FeedingEvent.query.filter_by(flock_id=flock_id, date=yesterday).all()
            feed_cost = sum(event.cost_total for event in events)
            revenue = (
                db.session.query(db.func.coalesce(db.func.sum(Revenue.amount), 0))
                .filter(Revenue.flock_id == flock_id, Revenue.date == yesterday)
                .scalar()
                or 0.0
            )

            flock = db.session.get(Flock, flock_id)
            headcount = flock.current_headcount if flock else 0
            net_pl = revenue - feed_cost
            cost_per_bird = feed_cost / headcount if headcount and headcount > 0 else 0.0

            record = FinancialRecord.query.filter_by(flock_id=flock_id, date=yesterday).first()
            if not record:
                record = FinancialRecord(
                    flock_id=flock_id,
                    date=yesterday,
                    revenue_source="other",
                )
                db.session.add(record)

            record.total_feed_cost = feed_cost
            record.total_revenue = revenue
            record.net_pl = net_pl
            record.cost_per_bird = cost_per_bird

        db.session.commit()
