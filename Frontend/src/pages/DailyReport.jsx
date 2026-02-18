import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const REPORT_STATUS = {
  PARTIAL: 'partial',
  FULL: 'full'
};

const getReportStatus = (report) => (
  report?.reportStatus === REPORT_STATUS.PARTIAL
    ? REPORT_STATUS.PARTIAL
    : REPORT_STATUS.FULL
);

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const pickPreferredReport = (current, candidate) => {
  if (!current) return candidate;

  const currentStatus = getReportStatus(current);
  const candidateStatus = getReportStatus(candidate);

  if (currentStatus !== candidateStatus) {
    return candidateStatus === REPORT_STATUS.FULL ? candidate : current;
  }

  const currentTs = Math.max(toMillis(current.updatedAt), toMillis(current.date));
  const candidateTs = Math.max(toMillis(candidate.updatedAt), toMillis(candidate.date));

  return candidateTs >= currentTs ? candidate : current;
};

const convertTimeTo24Hour = (timeStr) => {
  if (!timeStr) return '';
  const normalized = String(timeStr).trim();
  if (!normalized.includes(' ')) return normalized;

  const [time, modifier] = normalized.split(' ');
  if (!modifier) return normalized;

  let [hours, minutes] = time.split(':');
  let hour = parseInt(hours, 10);
  if (Number.isNaN(hour) || minutes === undefined) return '';

  const suffix = modifier.toUpperCase();
  if (suffix === 'PM' && hour !== 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${minutes}`;
};

const buildInitialFormData = (childName = '', configDefaults = { themes: [], commonParentsNote: '' }) => ({
  childName,
  inTime: '',
  outTime: '',
  snack: '',
  meal: '',
  sleepFrom: '',
  sleepTo: '',
  sleepNot: false,
  noDiaper: false,
  diaperChanges: '',
  toiletVisits: '',
  poops: '',
  feelings: [],
  notes: '',
  themes: Array.isArray(configDefaults.themes) ? [...configDefaults.themes] : [],
  email: '',
  email2: '',
  ouch: false,
  ouchReport: '',
  commonParentsNote: configDefaults.commonParentsNote || ''
});

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const mapReportToFormData = (report, configDefaults) => ({
  ...buildInitialFormData(report.childName || '', configDefaults),
  childName: report.childName || '',
  inTime: convertTimeTo24Hour(report.inTime || ''),
  outTime: convertTimeTo24Hour(report.outTime || ''),
  snack: report.snack || '',
  meal: report.meal || '',
  sleepFrom: convertTimeTo24Hour(report.sleepFrom || ''),
  sleepTo: convertTimeTo24Hour(report.sleepTo || ''),
  sleepNot: Boolean(report.sleepNot),
  noDiaper: Boolean(report.noDiaper),
  diaperChanges: report.diaperChanges || '',
  toiletVisits: report.toiletVisits || '',
  poops: report.poops || '',
  feelings: asArray(report.feelings),
  notes: report.notes || '',
  themes: asArray(report.themeOfTheDay).length
    ? asArray(report.themeOfTheDay)
    : asArray(report.themes).length
      ? asArray(report.themes)
      : (Array.isArray(configDefaults.themes) ? [...configDefaults.themes] : []),
  email: report.email || '',
  email2: report.email2 || '',
  ouch: Boolean(report.ouch),
  ouchReport: report.ouchReport || '',
  commonParentsNote: report.commonParentsNote || configDefaults.commonParentsNote || ''
});

const DailyReport = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = new URLSearchParams(location.search);
  const childFromParam = searchParams.get('child') || '';

  const [configDefaults, setConfigDefaults] = useState({ themes: [], commonParentsNote: '' });
  const [formData, setFormData] = useState(() => buildInitialFormData(childFromParam));
  const [kidsInfo, setKidsInfo] = useState([]);
  const [availableThemes, setAvailableThemes] = useState([]);
  const [presentChildren, setPresentChildren] = useState({});
  const [reportDocsByChild, setReportDocsByChild] = useState({});
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [hasAppliedInitialChild, setHasAppliedInitialChild] = useState(!childFromParam);
  const [isSaving, setIsSaving] = useState(false);

  const feelingsOptions = [
    { label: 'Happy', emoji: '😊' },
    { label: 'Sad', emoji: '😢' },
    { label: 'Restless', emoji: '😕' },
    { label: 'Quiet', emoji: '😌' },
    { label: 'Playful', emoji: '😜' },
    { label: 'Sick', emoji: '🤒' }
  ];
  const radioOptions = [0, 1, 2, 3, 4];

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const { startOfDay, endOfDay } = useMemo(() => {
    const d = new Date();
    return {
      startOfDay: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      endOfDay: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    };
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await getDoc(doc(db, 'appConfig', 'themeOfTheWeek'));
        if (!cfg.exists()) return;

        const data = cfg.data();
        const defaultThemes = Array.isArray(data.themeOfTheDay) ? data.themeOfTheDay : [];
        const defaultCommonNote = data.commonParentsNoteDate === todayStr
          ? data.commonParentsNote || ''
          : '';

        setAvailableThemes(data.theme || []);
        setConfigDefaults({ themes: defaultThemes, commonParentsNote: defaultCommonNote });

        setFormData((prev) => {
          if (prev.childName && reportDocsByChild[prev.childName]) return prev;
          return {
            ...prev,
            themes: prev.themes.length ? prev.themes : defaultThemes,
            commonParentsNote: prev.commonParentsNote || defaultCommonNote
          };
        });
      } catch (err) {
        console.error('Error loading config:', err);
      }
    };

    loadConfig();
  }, [todayStr, reportDocsByChild]);

  useEffect(() => {
    const loadKids = async () => {
      try {
        const snap = await getDocs(collection(db, 'kidsInfo'));
        setKidsInfo(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
    };

    loadKids();
  }, []);

  useEffect(() => {
    const loadAttendance = async () => {
      try {
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('date', '>=', startOfDay),
          where('date', '<', endOfDay)
        );

        const snap = await getDocs(attendanceQuery);
        const presentMap = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.attendance) return;

          Object.entries(data.attendance)
            .filter(([, record]) => record.status === 'present')
            .forEach(([name, record]) => {
              presentMap[name] = record;
            });
        });

        setPresentChildren(presentMap);
      } catch (err) {
        console.error('Error loading attendance:', err);
      }
    };

    loadAttendance();
  }, [startOfDay, endOfDay]);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const reportsQuery = query(
          collection(db, 'dailyReports'),
          where('date', '>=', startOfDay),
          where('date', '<', endOfDay)
        );

        const snap = await getDocs(reportsQuery);
        const byChild = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.childName) return;

          const candidate = {
            id: docSnap.id,
            ...data,
            reportStatus: getReportStatus(data)
          };

          byChild[data.childName] = pickPreferredReport(byChild[data.childName], candidate);
        });

        setReportDocsByChild(byChild);
      } catch (err) {
        console.error('Error loading daily reports:', err);
      } finally {
        setReportsLoaded(true);
      }
    };

    loadReports();
  }, [startOfDay, endOfDay]);

  useEffect(() => {
    if (!formData.childName || !kidsInfo.length) return;

    const kid = kidsInfo.find((k) => k.name === formData.childName);
    const email1 = kid?.email || '';
    const email2 = kid?.email2 || '';

    setFormData((prev) => {
      const nextEmail = prev.email || email1;
      const nextEmail2 = prev.email2 || email2;

      if (nextEmail === prev.email && nextEmail2 === prev.email2) return prev;
      return {
        ...prev,
        email: nextEmail,
        email2: nextEmail2
      };
    });
  }, [formData.childName, kidsInfo]);

  useEffect(() => {
    const rec = presentChildren[formData.childName];
    const normalizedInTime = convertTimeTo24Hour(rec?.time || '');
    if (!normalizedInTime) return;

    setFormData((prev) => (
      prev.inTime ? prev : { ...prev, inTime: normalizedInTime }
    ));
  }, [formData.childName, presentChildren]);

  useEffect(() => {
    if (hasAppliedInitialChild || !reportsLoaded) return;

    const existing = reportDocsByChild[childFromParam];
    if (existing) {
      setFormData(mapReportToFormData(existing, configDefaults));
    } else {
      const normalizedInTime = convertTimeTo24Hour(presentChildren[childFromParam]?.time || '');
      setFormData({
        ...buildInitialFormData(childFromParam, configDefaults),
        inTime: normalizedInTime
      });
    }

    setHasAppliedInitialChild(true);
  }, [
    hasAppliedInitialChild,
    reportsLoaded,
    reportDocsByChild,
    childFromParam,
    configDefaults,
    presentChildren
  ]);

  const convertTimeTo12Hour = (time24) => {
    if (!time24) return '';
    const [hourPart, minutePart] = time24.split(':').map(Number);
    const suffix = hourPart >= 12 ? 'PM' : 'AM';
    const hour = hourPart % 12 || 12;
    return `${String(hour).padStart(2, '0')}:${String(minutePart).padStart(2, '0')} ${suffix}`;
  };

  const buildReportPayload = (status) => {
    const now = new Date();
    const { themes, ...rest } = formData;

    return {
      ...rest,
      inTime: convertTimeTo12Hour(formData.inTime),
      outTime: convertTimeTo12Hour(formData.outTime),
      sleepFrom: convertTimeTo12Hour(formData.sleepFrom),
      sleepTo: convertTimeTo12Hour(formData.sleepTo),
      themeOfTheDay: themes,
      reportStatus: status,
      date: now,
      updatedAt: now
    };
  };

  const upsertReport = async (status) => {
    if (!formData.childName) {
      alert('Please select a child first.');
      return false;
    }

    try {
      const reportData = buildReportPayload(status);
      const existing = reportDocsByChild[formData.childName];

      if (existing) {
        const reportRef = doc(db, 'dailyReports', existing.id);
        await updateDoc(reportRef, reportData);

        setReportDocsByChild((prev) => ({
          ...prev,
          [formData.childName]: {
            ...prev[formData.childName],
            ...reportData,
            id: existing.id
          }
        }));
      } else {
        const newReport = {
          ...reportData,
          createdAt: new Date()
        };

        const newDocRef = await addDoc(collection(db, 'dailyReports'), newReport);

        setReportDocsByChild((prev) => ({
          ...prev,
          [formData.childName]: {
            ...newReport,
            id: newDocRef.id
          }
        }));
      }

      return true;
    } catch (err) {
      console.error('Error saving report:', err);
      alert('Error saving daily report.');
      return false;
    }
  };

  const handleSaveDraft = async () => {
    if (isSaving) return;

    setIsSaving(true);
    const saved = await upsertReport(REPORT_STATUS.PARTIAL);
    setIsSaving(false);

    if (saved) {
      alert('Draft saved. You can finish it later.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    const saved = await upsertReport(REPORT_STATUS.FULL);
    setIsSaving(false);

    if (saved) {
      alert('Daily report submitted successfully!');
      navigate('/');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === 'childName') {
      setHasAppliedInitialChild(true);
      const existing = reportDocsByChild[value];
      if (existing) {
        setFormData(mapReportToFormData(existing, configDefaults));
      } else {
        const normalizedInTime = convertTimeTo24Hour(presentChildren[value]?.time || '');
        setFormData({
          ...buildInitialFormData(value, configDefaults),
          inTime: normalizedInTime
        });
      }
      return;
    }

    if (type === 'checkbox' && name === 'sleepNot') {
      setFormData((prev) => ({ ...prev, sleepNot: checked, sleepFrom: '', sleepTo: '' }));
      return;
    }

    if (type === 'checkbox' && name === 'feelings') {
      setFormData((prev) => ({
        ...prev,
        feelings: prev.feelings.includes(value)
          ? prev.feelings.filter((item) => item !== value)
          : [...prev.feelings, value]
      }));
      return;
    }

    if (type === 'checkbox' && name === 'ouch') {
      setFormData((prev) => ({
        ...prev,
        ouch: checked,
        ouchReport: checked ? prev.ouchReport : ''
      }));
      return;
    }

    if (type === 'checkbox' && name === 'noDiaper') {
      setFormData((prev) => ({
        ...prev,
        noDiaper: checked,
        diaperChanges: checked ? '' : prev.diaperChanges,
        toiletVisits: checked ? prev.toiletVisits : ''
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleThemeCheckboxChange = (opt) => {
    setFormData((prev) => ({
      ...prev,
      themes: prev.themes.includes(opt)
        ? prev.themes.filter((item) => item !== opt)
        : [...prev.themes, opt]
    }));
  };

  const containerStyle = {
    background: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
    minHeight: '100vh',
    padding: '20px',
    fontFamily: 'Inter, Arial, sans-serif'
  };
  const formStyle = {
    background: '#fffbee',
    padding: '30px',
    borderRadius: '15px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
    maxWidth: '600px',
    margin: '0 auto'
  };
  const labelStyle = { fontWeight: '600', marginBottom: '5px', display: 'block' };
  const inputStyle = { width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ffc107', fontSize: '15px', outline: 'none' };
  const inputStyleTime = { width: '84%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ffc107', fontSize: '15px', outline: 'none' };
  const textStyle = { ...inputStyle, width: '92%' };
  const buttonStyle = { width: '100%', background: '#fcb69f', color: '#4e342e', fontWeight: '600', fontSize: '16px', padding: '15px', border: 'none', borderRadius: '30px', cursor: 'pointer' };
  const draftButtonStyle = { width: '100%', background: '#f7e07d', color: '#4e342e', fontWeight: '600', fontSize: '16px', padding: '15px', border: 'none', borderRadius: '30px', cursor: 'pointer', marginBottom: '10px' };
  const backButton = { backgroundColor: '#A62C2C', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'block', margin: '20px auto 0' };
  const rowStyle = { display: 'flex', gap: '30px', marginBottom: '15px' };
  const colStyle = { flex: 1, display: 'flex', flexDirection: 'column' };

  const availableChildren = Object.keys(presentChildren)
    .filter((name) => {
      const report = reportDocsByChild[name];
      return !report || getReportStatus(report) !== REPORT_STATUS.FULL || name === formData.childName;
    });

  return (
    <div style={containerStyle}>
      <form style={formStyle} onSubmit={handleSubmit}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#4e342e' }}>
          Daily Updates
        </h2>

        <label style={labelStyle}>Child's Name</label>
        <select
          name="childName"
          style={inputStyle}
          required
          value={formData.childName}
          onChange={handleChange}
        >
          <option value="" disabled>Select Child</option>
          {availableChildren.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {(formData.email || formData.email2) && (
          <>
            {formData.email && (
              <>
                <label style={labelStyle}>Email</label>
                <input
                  type="text"
                  readOnly
                  value={formData.email}
                  style={{ ...textStyle, backgroundColor: '#e9ecef' }}
                />
              </>
            )}
            {formData.email2 && (
              <>
                <label style={labelStyle}>Second Email</label>
                <input
                  type="text"
                  readOnly
                  value={formData.email2}
                  style={{ ...textStyle, backgroundColor: '#e9ecef' }}
                />
              </>
            )}
          </>
        )}

        <label style={labelStyle}>In and Out Time</label>
        <div style={rowStyle}>
          <div style={colStyle}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>In</label>
            <input
              type="time"
              name="inTime"
              style={inputStyleTime}
              required
              value={formData.inTime}
              onChange={handleChange}
            />
          </div>
          <div style={colStyle}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>Out</label>
            <input
              type="time"
              name="outTime"
              style={inputStyleTime}
              value={formData.outTime}
              onChange={handleChange}
            />
          </div>
        </div>

        <label style={labelStyle}>Child ate Snacks</label>
        <div style={{ marginBottom: '15px' }}>
          {['None', 'Some', 'Half', 'Most', 'All'].map((opt) => (
            <label key={opt} style={{ marginRight: '10px', fontWeight: '500' }}>
              <input
                type="radio"
                name="snack"
                value={opt}
                checked={formData.snack === opt}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        <label style={labelStyle}>Child ate Meals</label>
        <div style={{ marginBottom: '15px' }}>
          {['None', 'Some', 'Half', 'Most', 'All'].map((opt) => (
            <label key={opt} style={{ marginRight: '10px', fontWeight: '500' }}>
              <input
                type="radio"
                name="meal"
                value={opt}
                checked={formData.meal === opt}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        <label style={labelStyle}>Child Slept</label>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontWeight: '500', fontSize: '14px' }}>
            <input
              type="checkbox"
              name="sleepNot"
              checked={formData.sleepNot}
              onChange={handleChange}
            /> Child did not sleep in school
          </label>
        </div>
        <div style={rowStyle}>
          <div style={colStyle}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>From</label>
            <input
              type="time"
              name="sleepFrom"
              style={inputStyleTime}
              disabled={formData.sleepNot}
              required={!formData.sleepNot}
              value={formData.sleepFrom}
              onChange={handleChange}
            />
          </div>
          <div style={colStyle}>
            <label style={{ fontSize: '14px', fontWeight: '500' }}>To</label>
            <input
              type="time"
              name="sleepTo"
              style={inputStyleTime}
              disabled={formData.sleepNot}
              required={!formData.sleepNot}
              value={formData.sleepTo}
              onChange={handleChange}
            />
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontWeight: '600' }}>
            <input
              type="checkbox"
              name="noDiaper"
              checked={formData.noDiaper}
              onChange={handleChange}
              style={{ marginRight: '10px' }}
            />
            No Diaper
          </label>
        </div>

        {formData.noDiaper ? (
          <>
            <label style={labelStyle}>Toilet Visits</label>
            <div style={{ marginBottom: '15px' }}>
              {radioOptions.map((opt) => (
                <label key={opt} style={{ marginRight: '20px', fontWeight: '500' }}>
                  <input
                    type="radio"
                    name="toiletVisits"
                    value={String(opt)}
                    checked={formData.toiletVisits === String(opt)}
                    onChange={handleChange}
                    required
                  /> {opt}
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <label style={labelStyle}>Diaper Changes</label>
            <div style={{ marginBottom: '15px' }}>
              {radioOptions.map((opt) => (
                <label key={opt} style={{ marginRight: '20px', fontWeight: '500' }}>
                  <input
                    type="radio"
                    name="diaperChanges"
                    value={String(opt)}
                    checked={formData.diaperChanges === String(opt)}
                    onChange={handleChange}
                    required
                  /> {opt}
                </label>
              ))}
            </div>
          </>
        )}

        <label style={labelStyle}>Bowel movements</label>
        <div style={{ marginBottom: '20px' }}>
          {radioOptions.map((opt) => (
            <label key={opt} style={{ marginRight: '20px', fontWeight: '500' }}>
              <input
                type="radio"
                name="poops"
                value={String(opt)}
                checked={formData.poops === String(opt)}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        <label style={labelStyle}>Child was Feeling</label>
        <div style={{ marginBottom: '20px' }}>
          {feelingsOptions.map((opt) => (
            <label key={opt.label} style={{ marginRight: '20px', fontWeight: '500' }}>
              <input
                type="checkbox"
                name="feelings"
                value={opt.label}
                checked={formData.feelings.includes(opt.label)}
                onChange={handleChange}
              /> {opt.label} {opt.emoji}
            </label>
          ))}
        </div>

        <label style={labelStyle}>Theme of the Day</label>
        <div style={{ marginBottom: '20px' }}>
          {availableThemes.length
            ? availableThemes.map((opt) => (
                <label key={opt} style={{ marginRight: '10px', fontWeight: '500' }}>
                  <input
                    type="checkbox"
                    name="themes"
                    value={opt}
                    checked={formData.themes.includes(opt)}
                    onChange={() => handleThemeCheckboxChange(opt)}
                  /> {opt}
                </label>
              ))
            : <p>No themes available</p>}
        </div>

        <label style={labelStyle}>Teacher's Note</label>
        <textarea
          name="notes"
          rows="3"
          placeholder="Enter any additional notes here..."
          style={textStyle}
          value={formData.notes}
          onChange={handleChange}
        />

        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontWeight: '600', display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              name="ouch"
              checked={formData.ouch}
              onChange={handleChange}
              style={{ marginRight: '10px' }}
            /> Ouch Report
          </label>
          {formData.ouch && (
            <textarea
              name="ouchReport"
              rows="3"
              placeholder="Describe the ouch report..."
              style={textStyle}
              value={formData.ouchReport}
              onChange={handleChange}
            />
          )}
        </div>

        {formData.commonParentsNote && (
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Common Note for Parents</label>
            <textarea
              name="commonParentsNote"
              rows="3"
              placeholder="Common note for parents"
              style={textStyle}
              value={formData.commonParentsNote}
              onChange={handleChange}
            />
          </div>
        )}

        <button
          type="button"
          style={draftButtonStyle}
          onClick={handleSaveDraft}
          disabled={isSaving}
        >
          Save Draft
        </button>
        <button type="submit" style={buttonStyle} disabled={isSaving}>Update</button>
        <button type="button" style={backButton} onClick={() => navigate('/')}>Back to Home</button>
      </form>
    </div>
  );
};

export default DailyReport;
