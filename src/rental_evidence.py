"""Keep source retrieval, publication dates and real availability separate."""
import collections
import datetime
import re
from urllib.parse import urlsplit

GROUPS = {
    '5i5j.com': '我爱我家', 'ziroomapartment.com': '自如官方', 'ziroom.com': '自如官方',
    'wellcee.com': 'Wellcee', 'istay.cn': 'iStay', 'ke.com': '贝壳 / 链家',
    'lianjia.com': '贝壳 / 链家', '58.com': '58 / 安居客', 'anjuke.com': '58 / 安居客',
    'trip.com': 'Trip.com / 携程', 'snssdk.com': '幸福里', 'xflapp.com': '幸福里',
}


def source_group(url):
    host = urlsplit(url).hostname or ''
    return next((name for suffix, name in GROUPS.items() if host == suffix or host.endswith('.'+suffix)), host)


def canonical_url(url):
    match = re.search(r'wellcee\.com/(?:cn|en|tw)/rent-apartment/(\d+)', url)
    return 'https://www.wellcee.com/cn/rent-apartment/'+match[1] if match else url.split('#')[0]


def date_only(value):
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def annotate(record, as_of):
    record['source_group'] = source_group(record['source_url'])
    verification = record.get('verification', {})
    read_at = date_only(verification.get('read_at'))
    readable_method = verification.get('method') in ['direct_http', 'browser_rendered']
    current_read = bool(readable_method and verification.get('http_status') == 200
                        and verification.get('readable_body') and read_at and 0 <= (as_of-read_at).days <= 7)
    direct = bool(readable_method and verification.get('http_status') == 200 and verification.get('readable_body'))
    availability = record.get('availability_status', 'unconfirmed')
    last_active = date_only(record.get('publisher_last_active_at'))
    inactive = bool(last_active and (as_of-last_active).days > 30)
    price = record.get('price_month')
    current_price = bool(current_read and price and record.get('mode') != '方式待核' and not record.get('historical')
                         and not inactive and availability in ['source_available', 'unconfirmed'])
    record['direct_read'] = direct
    record['current_quote_eligible'] = current_price
    labels = {'full': '原页显示满房', 'future': '未来可入住', 'expired': '原转租窗口已过'}
    if availability in labels:
        label, code = labels[availability], availability
    elif inactive:
        label, code = '发布者超过30天未活跃', 'inactive'
    elif current_price:
        label, code = '本次原页可读报价', 'page_price'
    elif direct:
        label, code = '已直读原页，现价仍待核', 'page_reference'
    elif record.get('historical'):
        label, code = '历史资料', 'historical'
    else:
        label, code = '搜索或旧资料，现价待核', 'reference'
    record['freshness'] = {'code': code, 'label': label, 'as_of': as_of.isoformat(),
                           'read_at': verification.get('read_at'),
                           'publication_date_known': bool(record.get('original_published_at') or record.get('listing_updated_at'))}
    return record


def price_summary(records):
    current = [r for r in records if r.get('current_quote_eligible')]
    if not current:
        return '月租待核 · '+('有历史或日期不明资料' if records else '尚缺公开报价')
    parts = []
    for mode in dict.fromkeys(r['mode'] for r in current):
        values = [r['price_month'] for r in current if r['mode'] == mode]
        amount = str(min(values)) if min(values) == max(values) else f'{min(values)}–{max(values)}'
        parts.append(f'{mode} {amount}元/月')
    return '原页报价：'+'；'.join(parts)


def apply_evidence(data, evidence):
    as_of = date_only(data.get('research_updated_at', data['measured_at']))
    groups = collections.defaultdict(lambda: {'records': 0, 'urls': set(), 'pois': set(), 'direct_pages': set(), 'eligible_quotes': 0})
    totals = collections.Counter()
    seen_urls = set()
    for point in data['points']:
        research = evidence.get(point['id'], point.get('research', {}))
        records = research.setdefault('listings', [])
        for record in records:
            annotate(record, as_of)
            group = groups[record['source_group']]
            url = canonical_url(record['source_url']); group['records'] += 1; group['urls'].add(url);group['pois'].add(point['id']);seen_urls.add(url)
            if record['direct_read']:group['direct_pages'].add(url)
            if record['current_quote_eligible']:group['eligible_quotes'] += 1
            totals[record['freshness']['code']] += 1
        point['research'] = research
        point['price_text'] = price_summary(records)
        point['monthly_confirmed'] = any(r.get('current_quote_eligible') for r in records)
        point['source_groups'] = sorted({r['source_group'] for r in records})
        point['page_quote_count'] = sum(bool(r.get('current_quote_eligible')) for r in records)
        point['direct_page_count'] = len({canonical_url(r['source_url']) for r in records if r['direct_read']})
        point['private_bath_confirmed'] = any(r.get('private_bath') for r in records)
        point['private_room_confirmed'] = point.get('private_room_confirmed', False) or any(r.get('private_room') for r in records)
        if point['page_quote_count']:
            status = f'原页可读报价 {point["page_quote_count"]} 条 · 实际空房待确认'
        elif point['direct_page_count']:
            status = '已读原页，所见房态或时效仍有限制'
        else:
            status = '现价与空房待核 · 保留原有资料线索'
        point['info_status'] = research['status'] = status
    report = {'as_of': as_of.isoformat(), 'records': sum(totals.values()), 'unique_urls': len(seen_urls),
              'current_price_records': sum(g['eligible_quotes'] for g in groups.values()),
              'current_price_pois': sum(bool(p['page_quote_count']) for p in data['points']),
              'direct_pages': sum(len(g['direct_pages']) for g in groups.values()),
              'statuses': dict(totals), 'groups': []}
    for name, g in sorted(groups.items(), key=lambda item: -item[1]['records']):
        report['groups'].append({'name': name, 'records': g['records'], 'unique_urls': len(g['urls']),
                                 'pois': len(g['pois']), 'direct_pages': len(g['direct_pages']), 'eligible_quotes': g['eligible_quotes']})
    data['evidence_audit'] = report
    data['schema_version'] = 3
    return report
