"""ReportLab implementation of the supplied COR, permit and clearance form."""
from copy import deepcopy
from datetime import datetime
from io import BytesIO
from pathlib import Path
import json
import math
from xml.sax.saxutils import escape
import reportlab
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from ..core import number, text
from .schedules import days, display_time

CONFIG = json.loads((Path(__file__).resolve().parents[2] / 'data/cor_config.json').read_text(encoding='utf-8'))
FONT_DIR = Path(reportlab.__file__).parent / 'fonts'
for name, file in [('COR', 'Vera.ttf'), ('COR-Bold', 'VeraBd.ttf'), ('COR-Italic', 'VeraIt.ttf')]:
    if name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))


class Form:
    def __init__(self, canvas):
        self.c = canvas
        self.height = letter[1]

    def line(self, x1, y1, x2, y2, width=.5):
        self.c.setLineWidth(width)
        self.c.setStrokeColorRGB(0, 0, 0)
        self.c.line(x1, self.height-y1, x2, self.height-y2)

    def rect(self, x, y, w, h):
        self.c.setLineWidth(.5)
        self.c.setStrokeColorRGB(0, 0, 0)
        self.c.rect(x, self.height-y-h, w, h, stroke=1, fill=0)

    def label(self, value, x, y, width=None, size=7, bold=False, align='left', max_lines=1, italic=False):
        value = text(value)
        font = 'COR-Bold' if bold else 'COR-Italic' if italic else 'COR'
        if width:
            while size > 4.5 and (len(simpleSplit(value, font, size, width)) > max_lines or (max_lines == 1 and pdfmetrics.stringWidth(value, font, size) > width)):
                size -= .25
            lines = simpleSplit(value, font, size, width) or ['']
        else:
            lines = value.split('\n')
        self.c.setFont(font, size)
        self.c.setFillColorRGB(0, 0, 0)
        for index, line in enumerate(lines[:max_lines]):
            baseline = self.height-y-size-index*(size+1.5)
            if align == 'center' and width:
                self.c.drawCentredString(x+width/2, baseline, line)
            elif align == 'right' and width:
                self.c.drawRightString(x+width, baseline, line)
            else:
                self.c.drawString(x, baseline, line)

    def checkbox(self, x, y, checked, label, size=6.5, font_size=6.2):
        self.rect(x, y, size, size)
        if checked:
            self.line(x+1, y+size/2, x+size/2, y+size-1, .9)
            self.line(x+size/2, y+size-1, x+size-1, y+1, .9)
        self.label(label, x+size+3, y-.5, size=font_size)


def currency(value):
    return f'{number(value):,.2f}'


def format_rows(student, classes, subjects):
    rows = []
    for entry in classes:
        code = text(entry.get('subjectCode', entry.get('code')))
        subject = subjects.get(code.upper(), {})
        units = number(subject.get('units', entry.get('units', number(subject.get('lecture')) + number(subject.get('laboratory')) or 3)))
        hours = number(subject.get('lecture')) + number(subject.get('laboratory')) or number(entry.get('durationMinutes')) / 60 or units
        start, end = display_time(entry.get('startTime')), display_time(entry.get('endTime'))
        rows.append([code, str(units), str(hours), f'{start}-{end}' if start and end else text(entry.get('time')) or 'TBA',
                     ', '.join(days(entry)) or 'TBA', text(entry.get('roomName', entry.get('roomId', entry.get('room')))) or 'TBA',
                     text(entry.get('sectionName', entry.get('section'))) or f"{student.get('year', '')}-{student.get('section', '')}",
                     text(entry.get('profName', entry.get('instructor')))])
    return rows


COL_WIDTHS = [60, 22, 22, 80, 48, 46, 36, 124]
HEADERS = ['SUBJECT CODE', 'UNIT', 'HRS', 'TIME', 'DAYS', 'ROOM', 'SECTION', "INSTRUCTOR'S NAME/SIGNATURE"]


def subject_table(form, rows, top=142, width=438, count=10, totals=None):
    f = form
    widths = [w * width / 438 for w in COL_WIDTHS]
    f.rect(22, top, width, 14)
    f.label('SUBJECTS ENROLLED', 22, top+3, width, size=7, bold=True, align='center')
    y = top+14
    f.rect(22, y, width, 18)
    x = 22
    for header, w in zip(HEADERS, widths):
        f.label(header, x+2, y+4, w-4, size=5.3, bold=True, align='center', max_lines=2)
        if x != 22:
            f.line(x, y, x, y+18)
        x += w
    y += 18
    for index in range(count):
        f.rect(22, y, width, 14)
        x = 22
        for col, w in enumerate(widths):
            if x != 22:
                f.line(x, y, x, y+14)
            if index < len(rows):
                f.label(rows[index][col], x+2, y+1, w-4, size=5.5, align='center' if col in [1,2,6] else 'left', max_lines=2)
            x += w
        y += 14
    f.rect(22, y, width, 13)
    total_units = sum(number(r[1]) for r in (totals if totals is not None else rows))
    total_hours = sum(number(r[2]) for r in (totals if totals is not None else rows))
    f.label('TOTAL', 24, y+3, widths[0]-4, size=6, bold=True)
    f.label(f'{total_units:g}', 22+widths[0], y+3, widths[1], size=7, bold=True, align='center')
    f.label(f'{total_hours:g}', 22+sum(widths[:2]), y+3, widths[2], size=7, bold=True, align='center')
    if len(totals or []) > count:
        f.label('Additional subjects appear on the continuation page.', 22+sum(widths[:3])+4, y+3, width-sum(widths[:3])-8, size=6)
    return y+13


def front_page(form, student, rows, cfg):
    f = form
    f.rect(22, 20, 134, 34)
    f.label('OFFICIALLY ENROLLED', 22, 26, 134, size=8, bold=True, align='center')
    f.label('The Registrar', 22, 40, 134, size=7, align='center')
    f.label(cfg['school']['name'], 160, 20, 280, size=9.5, bold=True, align='center')
    f.label(cfg['school']['address'], 160, 34, 280, size=7, align='center')
    f.label(cfg['school']['title'], 160, 45, 280, size=8.5, bold=True, align='center')
    f.rect(470, 20, 120, 20)
    f.label("STUDENT'S COPY", 470, 25, 120, size=8, bold=True, align='center')
    f.label(datetime.now().strftime('%m/%d/%y %I:%M %p')+' | '+cfg['school']['defaultRegistrarName'], 430, 45, 160, size=6, align='right')
    academic = f"{text(student.get('semester'))} Semester   AY {text(student.get('schoolYear'))}   Course {text(student.get('course')) or 'BSIT'}   Year {text(student.get('year'))}   Section {text(student.get('section'))}"
    f.label(academic, 24, 65, 400, size=7.3, bold=True)
    f.label('Student No. '+text(student.get('studentNumber')), 430, 65, 160, size=7.3, bold=True, align='right')
    f.line(22, 77, 590, 77)
    names = [text(student.get('lastName')).upper(), (text(student.get('firstName'))+' '+text(student.get('suffix'))).strip().upper(), text(student.get('middleName')).upper()]
    for x, w, value, label in zip([24, 144, 268], [115, 120, 110], names, ['NAME (PRINT) Surname', 'First Name', 'Middle Name']):
        f.label(value, x, 83, w, size=8, bold=True)
        f.label(label, x, 95, w, size=6)
    f.line(22, 94, 385, 94)
    gender, status = text(student.get('gender')).lower(), text(student.get('status')).lower()
    f.rect(389, 80, 48, 25)
    f.checkbox(392, 83, gender.startswith('f'), 'Female')
    f.checkbox(392, 94, gender.startswith('m'), 'Male')
    f.rect(441, 80, 77, 25)
    f.checkbox(444, 83, status in {'block', 'enrolled'}, 'Blocked Section', font_size=5.5)
    f.checkbox(444, 94, status == 'irregular', 'Irregular Section', font_size=5.5)
    applicant_type = text(student.get('applicantType')).lower()
    new = 'new' in applicant_type or text(student.get('year')) == '1' and '1' in text(student.get('semester'))
    f.rect(522, 80, 68, 49)
    for i, (flag, label) in enumerate([(new,'New Student'), (not new and 'transfer' not in applicant_type and 'return' not in applicant_type,'Old Student'), ('transfer' in applicant_type,'Transferee'), ('return' in applicant_type,'Returnee')]):
        f.checkbox(525, 83+i*11, flag, label, size=6, font_size=5.8)
    address = ' '.join(filter(None, [text(student.get('permanentHouse') or student.get('presentHouse')), text(student.get('permanentStreet') or student.get('presentStreet')),
        text(student.get('permanentBarangay') or student.get('presentBarangay')), text(student.get('permanentCity') or student.get('presentCity')), text(student.get('permanentProvince') or student.get('presentProvince')), text(student.get('permanentZip') or student.get('presentZip'))]))
    f.label(address.upper(), 24, 108, 310, size=6.5, bold=True)
    f.label(text(student.get('contactNumber'))+'  '+text(student.get('email')), 338, 108, 177, size=6)
    f.line(22, 119, 518, 119)
    f.label('Address: Street / Barangay / Town or City / Province / Zip Code', 24, 122, 310, size=5.7)
    f.label('Contact No. / Email Address', 338, 122, 177, size=5.7)
    bottom = subject_table(f, rows[:10], totals=rows)
    f.rect(466, 142, 124, bottom-142)
    f.label('SCHOOL FEES', 466, 145, 124, size=7, bold=True, align='center')
    f.line(466, 156, 590, 156)
    fees = cfg['schoolFees']
    fee_rows = [('TUITION:', fees['tuition']), ('MISC:', fees['misc'])] + [(item['label'], item['amount']) for item in fees['miscBreakdown']] + [('Computer:',fees['computerFee']),('ID Card:',fees['idCardFee']),('Lab Fee:',fees['labFee'])]
    for i, (label, amount) in enumerate(fee_rows):
        f.label(label, 470, 161+i*9, 66, size=6, bold=i<2)
        f.label(currency(amount), 538, 161+i*9, 48, size=6, align='right')
    y = bottom+6
    f.rect(22, y, 235, 68)
    # Retain the supplied form's preprinted eligibility/payment defaults.
    f.checkbox(28,y+6, True,'Eligible for R.A. 10931',font_size=6)
    f.checkbox(142,y+6,False,'Not qualified for Free HE',font_size=5.8)
    f.checkbox(72,y+19,False,'Opt Out Mechanism',font_size=6)
    f.label(cfg['texts']['optOutDisclaimer'], 28,y+31,223,size=5.4,italic=True,max_lines=3)
    f.line(28,y+55,172,y+55)
    f.line(182,y+55,249,y+55)
    f.label('Printed Name & Signature of Student',28,y+57,145,size=5)
    f.label('Date',182,y+57,size=5)
    f.rect(263,y,327,68)
    f.label('PAYMENT SCHEME',263,y+3,327,size=7,bold=True,align='center')
    f.line(263,y+14,590,y+14)
    p = cfg['paymentScheme']
    for i,(left,lv,right,rv) in enumerate([('Total Assessment',currency(p['totalAssessment']),'DOWN PAYMENT',currency(p['downPayment'])),('Eligible for RA10931',currency(p['eligibleForRA10931']),'BALANCE',currency(p['balance'])),('Subsidized by LGU',currency(p['subsidizedByLGU']),'O.R. NO.',text(student.get('orNumber'))),('Back Accounts / Adjustment',currency(p['backAccounts']),'DATE',datetime.now().strftime('%Y-%m-%d'))]):
        yy=y+18+i*11
        f.label(left,267,yy,92,size=5.5)
        f.label(lv,360,yy,45,size=6,align='right')
        f.label(right,412,yy,87,size=5.5)
        f.label(rv,501,yy,85,size=6,align='right')
    f.label(cfg['texts']['admissionPledge'], 30,y+74,552,size=6,max_lines=2,align='center')
    f.line(218,y+102,394,y+102)
    f.label("Student's Signature and Date",218,y+104,176,size=6,align='center')


def back_form(form):
    f=form
    logo = Path(__file__).resolve().parents[3] / 'enrollment/src/assets/btech-logo.png'
    if logo.is_file():
        f.c.drawImage(str(logo),170,letter[1]-496,42,42,mask='auto',preserveAspectRatio=True)
    f.label('DALUBHASAANG POLITEKNIKO',224,456,250,size=10,bold=True)
    f.label('NG LUNGSOD NG BALIWAG',224,469,250,size=10,bold=True)
    f.label('#DalubhasaanKongMahal',224,484,250,size=7,bold=True)
    y=524
    for x,title in [(22,'EXAMINATION PERMIT'),(316,'SEMESTRAL-END CLEARANCE')]:
        f.label(title,x,508,274,size=9,bold=True,align='center')
        f.rect(x,y,274,224)
        f.line(x,y+26,x+274,y+26)
    f.line(88,y,88,y+224)
    f.label('SUBJECT CODE',24,y+6,62,size=6.2,bold=True,align='center',max_lines=2)
    f.label("INSTRUCTOR'S INITIALS",88,y+3,208,size=6.5,bold=True,align='center')
    f.line(88,y+13,296,y+13)
    for i,label in enumerate(['PRELIM','MIDTERM','PREFINAL','FINAL']):
        x=88+i*52
        if i:
            f.line(x,y+13,x,y+224)
        f.label(label,x,y+16,52,size=6,bold=True,align='center')
    for i in range(1,11):
        f.line(22,y+26+i*18,296,y+26+i*18)
    f.label('VALIDATION',24,y+26+10*18+5,62,size=6,bold=True,align='center')
    for x in [420,510]:
        f.line(x,y,x,y+224)
    for x,w,label in [(316,104,'DEPARTMENT / OFFICES'),(420,90,'SIGNATURE'),(510,80,'DATE mm/dd/yy')]:
        f.label(label,x+2,y+7,w-4,size=6.3,bold=True,align='center',max_lines=2)
    departments=['NINMO OFFICE','HRS/HRM CUSTODIAN','LIBRARY','INTERNSHIP COORD.','PREFECT OF ACTIVITIES','PREFECT OF DISCIPLINE','GUIDANCE','ADVISER','PROGRAM DIRECTOR','CASHIER I','IGP','REGISTRAR','CLINIC','OTHERS:']
    for i,label in enumerate(departments):
        yy=y+26+i*198/14
        if i:
            f.line(316,yy,590,yy)
        f.label(label,319,yy+3,98,size=5.9,bold=True)
    f.label('Please refer to your COR for the correct course codes.',22,752,274,size=5.8)
    f.label("Secure ALL required signatures before submitting to the Registrar's Office for the releasing of Grades.",316,752,274,size=5.8,max_lines=2)


def cor_pdf(students, classes_for_student, subjects_list, custom_config=None):
    cfg = deepcopy(CONFIG)
    for section, values in (custom_config or {}).items():
        if section in cfg:
            cfg[section].update(values)
    subjects = {text(s.get('subject_code',s.get('code'))).upper():s for s in subjects_list}
    buffer = BytesIO()
    canvas = Canvas(buffer, pagesize=letter, pageCompression=1)
    canvas.setTitle('Certificate of Registration')
    canvas.setAuthor(cfg['school']['name'])
    for student in students:
        rows = format_rows(student, classes_for_student(student) or [], subjects)
        form = Form(canvas)
        front_page(form,student,rows,cfg)
        back_form(form)
        canvas.showPage()
        # Never discard subjects beyond the fixed ten-row form.
        for start in range(10,len(rows),36):
            form=Form(canvas)
            form.label('CERTIFICATE OF REGISTRATION - SCHEDULE CONTINUATION',22,24,568,size=10,bold=True)
            form.label(f"{text(student.get('studentNumber'))}  {text(student.get('lastName'))}, {text(student.get('firstName'))}",22,44,568,size=9)
            chunk=rows[start:start+36]
            subject_table(form,chunk,top=65,width=568,count=len(chunk))
            canvas.showPage()
    canvas.save()
    return buffer.getvalue()
