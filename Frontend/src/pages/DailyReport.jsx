// src/pages/DailyReport.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const DailyReport = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Query param
  const searchParams = new URLSearchParams(location.search);
  const childFromParam = searchParams.get('child') || '';

  // Form state (now includes email2)
  const [formData, setFormData] = useState({
    childName: childFromParam,
    inTime: '',
    outTime: '',
    snack: '',
    meal: '',
    sleepFrom: '',
    sleepTo: '',
    sleepNot: false,
    diaperChanges: '',
    poops: '',
    feelings: [],
    notes: '',
    themes: [],
    email: '',
    email2: '',
    ouch: false,
    ouchReport: '',
    commonParentsNote: '',
  });

  // Other states
  const [kidsInfo, setKidsInfo] = useState([]);
  const [availableThemes, setAvailableThemes] = useState([]);
  const [presentChildren, setPresentChildren] = useState({});
  const [reportedChildren, setReportedChildren] = useState([]);

  // Feelings options
  const feelingsOptions = [
    { label: 'Happy', emoji: '😊' },
    { label: 'Sad', emoji: '😢' },
    { label: 'Restless', emoji: '😕' },
    { label: 'Quiet', emoji: '😌' },
    { label: 'Playful', emoji: '😜' },
    { label: 'Sick', emoji: '🤒' },
  ];
  const radioOptions = [0,1,2,3,4];

  // Today’s local string
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  const { startOfDay, endOfDay } = useMemo(() => {
    const d = new Date();
    return {
      startOfDay: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      endOfDay:   new Date(d.getFullYear(), d.getMonth(), d.getDate()+1),
    };
  }, []);

  // --- Load config (themes + today's commonParentsNote) ---
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await getDoc(doc(db, 'appConfig', 'themeOfTheWeek'));
        if (!cfg.exists()) return;
        const data = cfg.data();

        setAvailableThemes(data.theme || []);
        setFormData(f => ({
          ...f,
          themes: Array.isArray(data.themeOfTheDay) ? data.themeOfTheDay : f.themes,
          commonParentsNote:
            data.commonParentsNoteDate === todayStr
              ? data.commonParentsNote || ''
              : ''
        }));
      } catch (err) {
        console.error('Error loading config:', err);
      }
    };
    loadConfig();
  }, [todayStr]);

  // --- Load kids info ---
  useEffect(() => {
    const loadKids = async () => {
      try {
        const snap = await getDocs(collection(db, 'kidsInfo'));
        setKidsInfo(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
    };
    loadKids();
  }, []);

  // --- Load attendance ---
  useEffect(() => {
    const loadAtt = async () => {
      const q = query(
        collection(db, 'attendance'),
        where('date', '>=', startOfDay),
        where('date', '<', endOfDay)
      );
      const snap = await getDocs(q);
      const pres = {};
      snap.forEach(doc => {
        const d = doc.data();
        if (d.attendance) {
          Object.entries(d.attendance)
            .filter(([,r]) => r.status==='present')
            .forEach(([name,r]) => pres[name]=r);
        }
      });
      setPresentChildren(pres);
    };
    loadAtt();
  }, [startOfDay, endOfDay]);

  // --- Load existing daily reports to block duplicates ---
  useEffect(() => {
    const loadReports = async () => {
      const q = query(
        collection(db, 'dailyReports'),
        where('date','>=',startOfDay),
        where('date','<', endOfDay)
      );
      const snap = await getDocs(q);
      setReportedChildren(snap.docs.map(d => d.data().childName));
    };
    loadReports();
  }, [startOfDay, endOfDay]);

  // --- Auto‑fill emails when childName changes ---
  useEffect(() => {
    if (!formData.childName || !kidsInfo.length) return;
    const kid = kidsInfo.find(k => k.name===formData.childName);
    const email1 = kid?.email || '';
    const email2 = kid?.email2 || '';
    setFormData(f => ({ 
      ...f, 
      email: email1, 
      email2: email2 
    }));
  }, [formData.childName, kidsInfo]);

  // --- Auto‑fill inTime from attendance ---
  useEffect(() => {
    const rec = presentChildren[formData.childName];
    if (rec?.time) {
      setFormData(f => ({ ...f, inTime: rec.time }));
    }
  }, [formData.childName, presentChildren]);

  // --- Generic handler ---
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    if (type==='checkbox' && name==='sleepNot') {
      setFormData(f => ({ ...f, sleepNot: checked, sleepFrom:'', sleepTo:'' }));
    }
    else if (type==='checkbox' && name==='feelings') {
      setFormData(f => ({
        ...f,
        feelings: f.feelings.includes(value)
          ? f.feelings.filter(x=>x!==value)
          : [...f.feelings, value]
      }));
    }
    else if (type==='checkbox' && name==='ouch') {
      setFormData(f => ({
        ...f,
        ouch: checked,
        ouchReport: checked ? f.ouchReport : ''
      }));
    }
    else {
      setFormData(f => ({ ...f, [name]: value }));
    }
  };

  // Theme‑of‑day toggles
  const handleThemeCheckboxChange = opt => {
    setFormData(f => ({
      ...f,
      themes: f.themes.includes(opt)
        ? f.themes.filter(x=>x!==opt)
        : [...f.themes,opt]
    }));
  };

  // Time formatter
  const convertTimeTo12Hour = ts => {
    if (!ts) return '';
    const [h,m] = ts.split(':').map(Number);
    const ap = h>=12?'PM':'AM';
    const hr = h%12||12;
    return `${String(hr).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;
  };

  // --- Submit ---
  const handleSubmit = async e => {
    e.preventDefault();
    const formatted = {
      inTime: convertTimeTo12Hour(formData.inTime),
      outTime: convertTimeTo12Hour(formData.outTime),
      sleepFrom: convertTimeTo12Hour(formData.sleepFrom),
      sleepTo: convertTimeTo12Hour(formData.sleepTo),
    };
    const { themes, ...rest } = formData;
    const reportData = {
      ...rest,
      ...formatted,
      themeOfTheDay: themes,
      date: new Date()
    };

    try {
      await addDoc(collection(db, 'dailyReports'), reportData);
      alert('Daily report submitted successfully!');
      // reset
      setFormData({
        childName: '',
        inTime: '',
        outTime: '',
        snack: '',
        meal: '',
        sleepFrom: '',
        sleepTo: '',
        sleepNot: false,
        diaperChanges: '',
        poops: '',
        feelings: [],
        notes: '',
        themes: [],
        email: '',
        email2: '',
        ouch: false,
        ouchReport: '',
        commonParentsNote: '',
      });
      navigate('/');
    } catch (err) {
      console.error(err);
      alert('Error submitting daily report.');
    }
  };

  // Styles
  const containerStyle = {
    background: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
    minHeight: '100vh',
    padding: '20px',
    fontFamily: 'Inter, Arial, sans-serif',
  };
  const formStyle = {
    background: '#fffbee',
    padding: '30px',
    borderRadius: '15px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
    maxWidth: '600px',
    margin: '0 auto',
  };
  const labelStyle = { fontWeight: '600', marginBottom: '5px', display: 'block' };
  const inputStyle = {
    width: '100%', padding: '12px', marginBottom: '15px',
    borderRadius: '8px', border: '1px solid #ffc107',
    fontSize: '15px', outline: 'none'
  };
  const inputStyleTime = {
    width: '84%', padding: '12px', marginBottom: '15px',
    borderRadius: '8px', border: '1px solid #ffc107',
    fontSize: '15px', outline: 'none'
  };
  const textStyle = { ...inputStyle, width: '92%' };
  const buttonStyle = {
    width: '100%', background: '#fcb69f', color: '#4e342e',
    fontWeight: '600', fontSize: '16px', padding: '15px',
    border: 'none', borderRadius: '30px', cursor: 'pointer'
  };
  const rowStyle = { display: 'flex', gap: '30px', marginBottom: '15px' };
  const colStyle = { flex: 1, display: 'flex', flexDirection: 'column' };

  // Filter children dropdown
  const availableChildren = Object.keys(presentChildren)
    .filter(n => !reportedChildren.includes(n));

  return (
    <div style={containerStyle}>
      <form style={formStyle} onSubmit={handleSubmit}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#4e342e' }}>
          Daily Updates
        </h2>

        {/* Child Name */}
        <label style={labelStyle}>Child's Name</label>
        <select
          name="childName"
          style={inputStyle}
          required
          value={formData.childName}
          onChange={handleChange}
        >
          <option value="" disabled>Select Child</option>
          {availableChildren.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {/* Emails */}
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

        {/* In/Out */}
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
              required
              value={formData.outTime}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Snack/Meal */}
        <label style={labelStyle}>Child ate Snacks</label>
        <div style={{ marginBottom: '15px' }}>
          {['All','Some','None'].map(opt => (
            <label key={opt} style={{ marginRight:'10px', fontWeight:'500' }}>
              <input
                type="radio"
                name="snack"
                value={opt}
                checked={formData.snack===opt}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        <label style={labelStyle}>Child ate Meals</label>
        <div style={{ marginBottom: '15px' }}>
          {['All','Some','None'].map(opt => (
            <label key={opt} style={{ marginRight:'10px', fontWeight:'500' }}>
              <input
                type="radio"
                name="meal"
                value={opt}
                checked={formData.meal===opt}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        {/* Sleep */}
        <label style={labelStyle}>Child Slept</label>
        <div style={{ marginBottom:'10px' }}>
          <label style={{ fontWeight:'500', fontSize:'14px' }}>
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
            <label style={{ fontSize:'14px', fontWeight:'500' }}>From</label>
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
            <label style={{ fontSize:'14px', fontWeight:'500' }}>To</label>
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

        {/* Diaper & Poops */}
        <label style={labelStyle}>Diaper Changes</label>
        <div style={{ marginBottom:'15px' }}>
          {radioOptions.map(opt => (
            <label key={opt} style={{ marginRight:'20px', fontWeight:'500' }}>
              <input
                type="radio"
                name="diaperChanges"
                value={String(opt)}
                checked={formData.diaperChanges===String(opt)}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        <label style={labelStyle}>Bowel movements</label>
        <div style={{ marginBottom:'20px' }}>
          {radioOptions.map(opt => (
            <label key={opt} style={{ marginRight:'20px', fontWeight:'500' }}>
              <input
                type="radio"
                name="poops"
                value={String(opt)}
                checked={formData.poops===String(opt)}
                onChange={handleChange}
                required
              /> {opt}
            </label>
          ))}
        </div>

        {/* Feelings */}
        <label style={labelStyle}>Child was Feeling</label>
        <div style={{ marginBottom:'20px' }}>
          {feelingsOptions.map(o => (
            <label key={o.label} style={{ marginRight:'20px', fontWeight:'500' }}>
              <input
                type="checkbox"
                name="feelings"
                value={o.label}
                checked={formData.feelings.includes(o.label)}
                onChange={handleChange}
              /> {o.label} {o.emoji}
            </label>
          ))}
        </div>

        {/* Theme of the Day */}
        <label style={labelStyle}>Theme of the Day</label>
        <div style={{ marginBottom:'20px' }}>
          {availableThemes.length
            ? availableThemes.map(opt => (
                <label key={opt} style={{ marginRight:'10px', fontWeight:'500' }}>
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

        {/* Teacher's Note */}
        <label style={labelStyle}>Teacher's Note</label>
        <textarea
          name="notes"
          rows="3"
          placeholder="Enter any additional notes here..."
          style={textStyle}
          value={formData.notes}
          onChange={handleChange}
        />

        {/* Ouch Report */}
        <div style={{ marginBottom:'15px' }}>
          <label style={{ fontWeight:'600', display:'flex', alignItems:'center' }}>
            <input
              type="checkbox"
              name="ouch"
              checked={formData.ouch}
              onChange={handleChange}
              style={{ marginRight:'10px' }}
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

        {/* Show Common Parents Note only if it's prefilled */}
        {formData.commonParentsNote && (
          <div style={{ marginBottom:'20px' }}>
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

        <button type="submit" style={buttonStyle}>Update</button>
      </form>
    </div>
  );
};

export default DailyReport;
