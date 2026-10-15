"""Schedule enrichment, overlap detection and the existing greedy generator."""
import re
from copy import deepcopy
from ..core import number, text, year_number

VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
VALID_START_TIMES = list(range(420, 1200, 30))


def parse_time(value):
    if value is None or isinstance(value, bool) or text(value) == '':
        return None
    match = re.fullmatch(r'(\d{1,2}):(\d{2})\s*(AM|PM)?', text(value), re.I)
    if match:
        hour, minute = int(match[1]), int(match[2])
        if minute > 59 or hour > (12 if match[3] else 23) or (match[3] and hour < 1):
            return None
        if match[3]:
            hour = hour % 12 + (12 if match[3].upper() == 'PM' else 0)
        return hour * 60 + minute
    return number(value, None)


def display_time(value):
    minutes = parse_time(value)
    if minutes is None:
        return ''
    hour = int(minutes // 60) % 24
    return f"{hour % 12 or 12}:{int(minutes % 60):02d} {'PM' if hour >= 12 else 'AM'}"


def term_key(value):
    raw = text(value).lower()
    if '1' in raw or 'first' in raw:
        return '1st Semester'
    if '2' in raw or 'second' in raw:
        return '2nd Semester'
    return raw or '1st Semester'


def academic_key(value):
    return re.sub(r'\s*-\s*', ' - ', text(value))


def days(entry):
    raw = entry.get('days') if isinstance(entry.get('days'), list) else [entry.get('day')]
    return list(dict.fromkeys(text(day) for day in raw if text(day)))


def section_label(schedule, entry=None):
    entry = entry or {}
    # Master schedules can contain classes from several sections and year levels.
    raw = text(entry.get('sectionName', entry.get('section')))
    if raw:
        match = re.search(r'([1-4])[-_\s]*([A-Za-z]+)$', raw)
        return match[1] + match[2] if match else raw
    year = text(schedule.get('year'))
    section = text(schedule.get('section'))
    if section:
        return section if not year or section.startswith(year) else year + section
    return 'Unassigned'


def curriculum_entries(document):
    if isinstance(document.get('semesters'), list):
        return [(subject, term.get('semester')) for term in document['semesters'] for subject in term.get('subjects', [])]
    return [(subject, document.get('semester')) for subject in document.get('subjects', [])]


def enrich(schedules, curricula):
    lookup, by_code = {}, {}
    for document in curricula:
        year = document.get('year') or year_number(document.get('_id'))
        for subject, term in curriculum_entries(document):
            code = text(subject.get('subject_code', subject.get('code'))).upper()
            if not code:
                continue
            details = {'title': text(subject.get('title')), 'units': number(subject.get('units'))}
            lookup[(year_number(year), term_key(term), code)] = details
            by_code.setdefault(code, details)
    result = deepcopy(schedules)
    for schedule in result:
        for entry in schedule.get('classes') or []:
            code = text(entry.get('subjectCode', entry.get('subject_code'))).upper()
            match = re.search(r'([1-4])\s*[-_/\s]?\s*[A-Za-z]+$', text(entry.get('sectionName')))
            year = schedule.get('year') or (match[1] if match else year_number(schedule.get('curriculum_id')))
            details = lookup.get((year_number(year), term_key(schedule.get('semester')), code), by_code.get(code))
            if details:
                entry.update(subjectName=details['title'], subjectTitle=details['title'], units=details['units'])
            else:
                entry.setdefault('subjectName', '')
                entry.setdefault('subjectTitle', '')
                entry['units'] = number(entry.get('units'))
    return result


def detect_conflicts(schedules):
    sessions = []
    for schedule in schedules:
        for index, entry in enumerate(schedule.get('classes') or []):
            start, end = parse_time(entry.get('startTime')), parse_time(entry.get('endTime'))
            if start is None or end is None or start >= end or not days(entry):
                continue
            sessions.append({'scheduleId': str(schedule.get('_id', '')), 'classIndex': index,
                'section': section_label(schedule, entry), 'semester': term_key(schedule.get('semester')),
                'schoolYear': academic_key(schedule.get('academicYear', schedule.get('academic_year'))),
                'subjectCode': text(entry.get('subjectCode')) or 'Unknown Subject',
                'instructor': text(entry.get('profName', entry.get('profId', entry.get('instructor')))),
                'room': text(entry.get('roomName', entry.get('roomId', entry.get('room')))),
                'days': days(entry), 'start': start, 'end': end,
                'time': f'{display_time(start)} - {display_time(end)}'})
    conflicts, seen = [], set()
    invalid = {'tba', 'unassigned', 'none', 'n/a', ''}
    for i, left in enumerate(sessions):
        for right in sessions[i + 1:]:
            if (left['semester'], left['schoolYear']) != (right['semester'], right['schoolYear']):
                continue
            if not (left['start'] < right['end'] and right['start'] < left['end']):
                continue
            common_days = [day for day in left['days'] if day in right['days']]
            for day in common_days:
                for kind, field in [('section', 'section'), ('instructor', 'instructor'), ('room', 'room')]:
                    value = left[field]
                    if value.lower() in invalid | ({'online'} if kind == 'room' else set()) or value.lower() != right[field].lower():
                        continue
                    key = (kind, value.lower(), day, left['semester'], left['schoolYear'], left['scheduleId'], left['classIndex'], right['scheduleId'], right['classIndex'])
                    if key in seen:
                        continue
                    seen.add(key)
                    message = f"{kind.capitalize()} conflict: {value} has overlapping {left['subjectCode']} ({left['section']}) and {right['subjectCode']} ({right['section']}) classes on {day}, {display_time(max(left['start'], right['start']))} - {display_time(min(left['end'], right['end']))}."
                    conflicts.append({'type': kind, 'severity': 'error', 'day': day, 'scheduleId': left['scheduleId'],
                        'section': left['section'], 'semester': left['semester'], 'schoolYear': left['schoolYear'],
                        field: value, 'subjectCodes': [left['subjectCode'], right['subjectCode']],
                        'classA': {k: left[k] for k in ['subjectCode', 'time', 'section']},
                        'classB': {k: right[k] for k in ['subjectCode', 'time', 'section']}, 'message': message})
    count = len(conflicts)
    return {'hasConflicts': bool(count), 'conflictsCount': count, 'conflicts': conflicts,
            'status': {'hasConflicts': bool(count), 'message': f"{count} Schedule Conflict{'s' if count != 1 else ''} Detected" if count else 'No Schedule Conflicts Detected',
                       'description': 'Review overlapping section, instructor, or room assignments.' if count else 'All assigned schedules passed validation.'}}


def solve(workload):
    scheduled, unassigned = [], []
    for session in sorted(workload, key=lambda row: not row['isLaboratory']):
        assigned = False
        for day in VALID_DAYS:
            if assigned:
                break
            for start in VALID_START_TIMES:
                if assigned:
                    break
                end = start + session['durationMinutes']
                if end > 1200 or end <= start:
                    continue
                for room in session['candidateRooms']:
                    if assigned:
                        break
                    for professor in session['candidateProfs']:
                        trial = {k: session[k] for k in ['sectionName', 'subjectCode', 'semester']}
                        trial.update(day=day, startTime=start, endTime=end, roomId=text(room.get('id', room.get('_id'))),
                            roomName=text(room.get('name')), profId=text(professor.get('id', professor.get('_id'))), profName=text(professor.get('name')))
                        overlaps = any(old['semester'] == trial['semester'] and old['day'] == day and start < old['endTime'] and old['startTime'] < end
                            and (old['roomId'] == trial['roomId'] or old['profId'] == trial['profId'] or old['sectionName'] == trial['sectionName']) for old in scheduled)
                        if not overlaps:
                            scheduled.append(trial)
                            assigned = True
                            break
        if not assigned:
            unassigned.append(f"{session['subjectCode']} for {session['sectionName']}")
    return {'masterSchedule': scheduled, 'unassignedSessions': unassigned}
