// src/pages/Home.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import giraffeIcon from '../assets/Logo.png';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';

const REPORT_STATUS = {
  PARTIAL: 'partial',
  FULL: 'full'
};
const WEEKLY_THEME_PREVIEW_COUNT = 4;

const getReportStatus = (report) => (
  report?.reportStatus === REPORT_STATUS.PARTIAL
    ? REPORT_STATUS.PARTIAL
    : REPORT_STATUS.FULL
);

const convertTimeTo24Hour = (timeStr) => {
  if (!timeStr) return '';
  const normalized = String(timeStr).trim();
  if (!normalized.includes(' ')) return normalized;

  const [time, modifier] = normalized.split(' ');
  if (!modifier) return normalized;

  const [hours, minutes] = time.split(':');
  let hour = parseInt(hours, 10);
  if (Number.isNaN(hour) || minutes === undefined) return '';

  const suffix = modifier.toUpperCase();
  if (suffix === 'PM' && hour !== 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${minutes}`;
};

const hasMeaningfulDraftContent = (report, attendanceRecord) => {
  if (!report) return false;

  const attendanceInTime = convertTimeTo24Hour(attendanceRecord?.time || '');
  const reportInTime = convertTimeTo24Hour(report.inTime || '');
  const hasCustomInTime = reportInTime && attendanceInTime
    ? reportInTime !== attendanceInTime
    : Boolean(reportInTime);

  const hasTextInput = [
    report.outTime,
    report.snack,
    report.meal,
    report.sleepFrom,
    report.sleepTo,
    report.diaperChanges,
    report.toiletVisits,
    report.poops,
    report.notes,
    report.ouchReport
  ].some((value) => String(value || '').trim() !== '');

  const hasCheckedFlags = Boolean(report.sleepNot || report.noDiaper || report.ouch);
  const hasFeelings = Array.isArray(report.feelings) && report.feelings.length > 0;

  return hasCustomInTime || hasTextInput || hasCheckedFlags || hasFeelings;
};

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

const StarIcon = () => (
  <span style={{ color: '#FFD700', marginRight: '6px' }}>★</span>
);

const Home = () => {
  const navigate = useNavigate();

  const [themeTags, setThemeTags] = useState([]);
  const [dayThemes, setDayThemes] = useState([]);
  const [kids, setKids] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [dailyReportsMapping, setDailyReportsMapping] = useState({});
  const [docId, setDocId] = useState(null);
  const [autoMarked, setAutoMarked] = useState(false);
  const [isWeeklyThemeExpanded, setIsWeeklyThemeExpanded] = useState(false);

  const registeredKidNames = new Set(kids.map((kid) => kid.name));
  const markedCount = Object.entries(attendanceData).filter(([kidName, record]) => (
    registeredKidNames.has(kidName) &&
    (record?.status === 'present' || record?.status === 'absent')
  )).length;

  const styles = {
    container: {
      padding: '20px',
      fontFamily: 'Inter, Arial, sans-serif',
      background: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
      minHeight: '100vh'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px'
    },
    title: {
      margin: 0,
      color: '#555',
      fontSize: '24px',
      fontWeight: '700'
    },
    dateText: {
      fontSize: '16px',
      color: '#555'
    },
    attendanceSummary: {
      backgroundColor: '#444',
      color: '#fff',
      padding: '20px',
      borderRadius: '8px',
      marginBottom: '20px'
    },
    progressBarOuter: {
      width: '100%',
      height: '15px',
      backgroundColor: '#eee',
      borderRadius: '8px',
      marginTop: '15px'
    },
    progressBarInner: {
      height: '15px',
      backgroundColor: '#ffd60a',
      borderRadius: '8px',
      transition: 'width 0.4s ease'
    },
    themeLine: {
      marginTop: '10px',
      fontStyle: 'italic'
    },
    themeToggleButton: {
      marginTop: '4px',
      marginLeft: '22px',
      background: 'transparent',
      border: 'none',
      color: '#ffd60a',
      fontSize: '13px',
      cursor: 'pointer',
      textDecoration: 'underline',
      padding: 0
    },
    reportLegend: {
      marginTop: '8px',
      marginBottom: 0,
      fontSize: '13px',
      color: '#ffe4a3'
    },
    twoBoxesContainer: {
      display: 'flex',
      justifyContent: 'center',
      gap: '20px',
      marginBottom: '20px'
    },
    boxOrange: {
      backgroundColor: '#E67E22',
      color: '#fff',
      padding: '20px',
      width: '140px',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: '16px',
      borderRadius: '8px',
      cursor: 'pointer'
    },
    boxYellow: {
      backgroundColor: '#F1C40F',
      color: '#fff',
      padding: '20px',
      width: '140px',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: '16px',
      borderRadius: '8px',
      cursor: 'pointer'
    },
    boxBlue: {
      backgroundColor: '#4e342e',
      color: '#fff',
      padding: '20px',
      width: '140px',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: '16px',
      borderRadius: '8px',
      cursor: 'pointer'
    },
    attendanceSection: {
      backgroundColor: '#ffffff',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    },
    kidRow: {
      padding: '10px 5px',
      borderBottom: '1px solid #eee'
    },
    rowTop: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    nameCell: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap'
    },
    kidName: {
      fontSize: '16px',
      cursor: 'pointer',
      fontWeight: 'bold',
      color: '#555'
    },
    tickIcon: {
      color: 'green',
      marginLeft: '8px',
      fontSize: '18px'
    },
    reportPill: {
      padding: '3px 8px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: '700'
    },
    buttonGroup: {
      display: 'flex',
      gap: '8px'
    },
    button: {
      padding: '6px 10px',
      borderRadius: '4px',
      border: 'none',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      backgroundColor: '#ccc',
      color: '#333',
      transition: 'background-color 0.3s ease'
    },
    outButton: {
      marginTop: '-12px',
      padding: '6px 46px',
      borderRadius: '4px',
      border: 'none',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      backgroundColor: '#475c6c',
      color: '#fff'
    }
  };

  const getReportStateForKid = (kidName) => {
    const attendanceStatus = attendanceData[kidName]?.status;
    if (attendanceStatus !== 'present') return null;

    const notFilledState = {
      value: 'not_filled',
      label: 'Not filled',
      backgroundColor: '#f8d7da',
      color: '#842029'
    };

    const report = dailyReportsMapping[kidName];
    if (!report) {
      return notFilledState;
    }

    if (getReportStatus(report) === REPORT_STATUS.PARTIAL) {
      if (!hasMeaningfulDraftContent(report, attendanceData[kidName])) {
        return notFilledState;
      }

      return {
        value: 'partial',
        label: 'Partially filled',
        backgroundColor: '#fff3cd',
        color: '#664d03'
      };
    }

    return {
      value: 'full',
      label: 'Fully filled',
      backgroundColor: '#d1e7dd',
      color: '#0f5132'
    };
  };

  const loadKidsInfo = async () => {
    try {
      const kidsSnapshot = await getDocs(collection(db, 'kidsInfo'));
      const kidsList = kidsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setKids(kidsList);
    } catch (error) {
      console.error('Error fetching kids info:', error);
    }
  };

  const loadThemesFromFirebase = async () => {
    try {
      const themeDocRef = doc(db, 'appConfig', 'themeOfTheWeek');
      const snapshot = await getDoc(themeDocRef);

      if (!snapshot.exists()) return;

      const data = snapshot.data();
      if (data.theme) {
        if (Array.isArray(data.theme)) {
          setThemeTags(data.theme);
        } else if (typeof data.theme === 'string') {
          setThemeTags(data.theme.split(',').map((tag) => tag.trim()));
        }
      }

      if (data.themeOfTheDay) {
        setDayThemes(data.themeOfTheDay);
      }
    } catch (error) {
      console.error('Error loading themes from Firebase:', error);
    }
  };

  const fetchAttendance = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('date', '>=', startOfDay),
        where('date', '<', endOfDay)
      );

      const snapshot = await getDocs(attendanceQuery);
      let tempAttendance = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.attendance) {
          tempAttendance = { ...tempAttendance, ...data.attendance };
        }
        setDocId(docSnap.id);
      });

      setAttendanceData(tempAttendance);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const fetchDailyReports = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const reportsQuery = query(
        collection(db, 'dailyReports'),
        where('date', '>=', startOfDay),
        where('date', '<', endOfDay)
      );

      const snapshot = await getDocs(reportsQuery);
      const reportsMapping = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data?.childName) return;

        const candidate = {
          ...data,
          id: docSnap.id,
          reportStatus: getReportStatus(data)
        };

        reportsMapping[data.childName] = pickPreferredReport(
          reportsMapping[data.childName],
          candidate
        );
      });

      setDailyReportsMapping(reportsMapping);
    } catch (error) {
      console.error('Error fetching daily reports:', error);
    }
  };

  const markAttendance = useCallback(async (kidName, status) => {
    const now = new Date();
    const dateString = now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const timeHHMM = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const updatedRecord = { status, time: timeHHMM, markedAt: dateString };

    setAttendanceData((prev) => ({ ...prev, [kidName]: updatedRecord }));

    try {
      if (docId) {
        const attendanceRef = doc(db, 'attendance', docId);
        await updateDoc(attendanceRef, {
          [`attendance.${kidName}`]: updatedRecord,
          date: new Date()
        });
      } else {
        const newDoc = await addDoc(collection(db, 'attendance'), {
          date: new Date(),
          attendance: { [kidName]: updatedRecord }
        });
        setDocId(newDoc.id);
      }
    } catch (error) {
      console.error('Error marking attendance:', error);
      alert('Failed to mark attendance.');
    }
  }, [docId]);

  useEffect(() => {
    if (!autoMarked) {
      const now = new Date();
      if (now.getHours() >= 12) {
        kids.forEach((kid) => {
          if (!attendanceData[kid.name]) {
            markAttendance(kid.name, 'absent');
          }
        });
        setAutoMarked(true);
      }
    }
  }, [autoMarked, kids, attendanceData, markAttendance]);

  const handleMarkOutTime = async (kidName) => {
    const report = dailyReportsMapping[kidName];
    if (!report || getReportStatus(report) !== REPORT_STATUS.FULL) return;

    const now = new Date();
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    try {
      const reportRef = doc(db, 'dailyReports', report.id);
      await updateDoc(reportRef, { outTime: formattedTime, updatedAt: new Date() });

      setDailyReportsMapping((prev) => ({
        ...prev,
        [kidName]: { ...prev[kidName], outTime: formattedTime, updatedAt: new Date() }
      }));
    } catch (error) {
      console.error('Error marking out time:', error);
      alert('Failed to update out time.');
    }
  };

  const handleKidClick = (kidName) => {
    const attendance = attendanceData[kidName];
    if (!attendance || attendance.status !== 'present') {
      alert(`Daily report can only be submitted if ${kidName} is marked Present.`);
      return;
    }

    const report = dailyReportsMapping[kidName];
    if (report && getReportStatus(report) === REPORT_STATUS.FULL) {
      alert(`Daily report for ${kidName} is already fully filled.`);
      return;
    }

    navigate(
      `/daily-report?child=${encodeURIComponent(kidName)}&themeOfTheDay=${encodeURIComponent(dayThemes.join(', '))}`
    );
  };

  const todayDateString = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const progressPercentage = kids.length > 0
    ? Math.min(100, (markedCount / kids.length) * 100)
    : 0;
  const hasWeeklyThemeOverflow = themeTags.length > WEEKLY_THEME_PREVIEW_COUNT;
  const weeklyThemeVisibleTags = hasWeeklyThemeOverflow && !isWeeklyThemeExpanded
    ? themeTags.slice(0, WEEKLY_THEME_PREVIEW_COUNT)
    : themeTags;
  const weeklyThemeSummary = weeklyThemeVisibleTags.join(', ') || 'None';
  const hiddenWeeklyCount = themeTags.length - weeklyThemeVisibleTags.length;

  const sortedKids = [...kids].sort((a, b) => {
    const statusA = attendanceData[a.name]?.status;
    const statusB = attendanceData[b.name]?.status;
    if (statusA === 'present' && statusB !== 'present') return -1;
    if (statusA !== 'present' && statusB === 'present') return 1;
    if (statusA === 'absent' && statusB !== 'absent') return 1;
    if (statusA !== 'absent' && statusB === 'absent') return -1;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    loadKidsInfo();
    loadThemesFromFirebase();
    fetchAttendance();
    fetchDailyReports();
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={giraffeIcon}
            alt="Giraffe"
            style={{ width: '70px', height: '70px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span style={styles.dateText}>{todayDateString}</span>
          <button
            onClick={() => { auth.signOut(); navigate('/login'); }}
            style={{
              padding: '6px 18px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#f28c8c',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Log Out
          </button>
        </div>
      </header>

      <div style={styles.attendanceSummary}>
        <h3 style={{ margin: 0 }}>Today's Attendance</h3>
        <p style={{ margin: '5px 0 0' }}>
          {markedCount}/{kids.length} Done
        </p>
        <div style={styles.progressBarOuter}>
          <div
            style={{ ...styles.progressBarInner, width: `${progressPercentage}%` }}
          />
        </div>
        <div style={styles.themeLine}>
          <span><StarIcon /> Theme of the week: {weeklyThemeSummary}</span>
          {hasWeeklyThemeOverflow && !isWeeklyThemeExpanded && hiddenWeeklyCount > 0 && (
            <span>{` +${hiddenWeeklyCount} more`}</span>
          )}
          {hasWeeklyThemeOverflow && (
            <button
              type="button"
              style={styles.themeToggleButton}
              onClick={() => setIsWeeklyThemeExpanded((prev) => !prev)}
            >
              {isWeeklyThemeExpanded ? 'Show less' : `Show all ${themeTags.length}`}
            </button>
          )}
        </div>
        <p style={styles.themeLine}>
          <StarIcon /> Theme of the day: {dayThemes.join(', ')}
        </p>
      </div>

      <div style={styles.twoBoxesContainer}>
        <div
          style={styles.boxOrange}
          onClick={() =>
            navigate(
              `/daily-report?themeOfTheDay=${encodeURIComponent(dayThemes.join(', '))}`
            )
          }
        >
          Daily Updates
        </div>
        <div
          style={styles.boxYellow}
          onClick={() => navigate('/theme-management')}
        >
          Theme & Note
        </div>
        <div
          style={styles.boxBlue}
          onClick={() => navigate('/report')}
        >
          View Report
        </div>
      </div>

      <div style={styles.attendanceSection}>
        {sortedKids.map((kid) => {
          const currentStatus = attendanceData[kid.name]?.status;
          const reportState = getReportStateForKid(kid.name);
          const report = dailyReportsMapping[kid.name];

          const presentStyle = {
            ...styles.button,
            backgroundColor: currentStatus === 'present' ? '#90be6d' : '#ccc',
            color: currentStatus === 'present' ? '#fff' : '#333'
          };
          const absentStyle = {
            ...styles.button,
            backgroundColor: currentStatus === 'absent' ? '#f94144' : '#ccc',
            color: currentStatus === 'absent' ? '#fff' : '#333'
          };

          return (
            <div key={kid.id} style={styles.kidRow}>
              <div style={styles.rowTop}>
                <div style={styles.nameCell}>
                  <span
                    style={{
                      ...styles.kidName,
                      color: currentStatus === 'present' ? '#0077b6' : '#555'
                    }}
                    onClick={() => handleKidClick(kid.name)}
                  >
                    {kid.name}
                    {report && getReportStatus(report) === REPORT_STATUS.FULL && (
                      <span style={styles.tickIcon}>✓</span>
                    )}
                  </span>
                  {reportState && (
                    <span
                      style={{
                        ...styles.reportPill,
                        backgroundColor: reportState.backgroundColor,
                        color: reportState.color
                      }}
                    >
                      {reportState.label}
                    </span>
                  )}
                </div>

                <div style={styles.buttonGroup}>
                  <button
                    style={presentStyle}
                    onClick={() => markAttendance(kid.name, 'present')}
                  >
                    Present
                  </button>
                  <button
                    style={absentStyle}
                    onClick={() => markAttendance(kid.name, 'absent')}
                  >
                    Absent
                  </button>
                </div>
              </div>

              {attendanceData[kid.name] && (
                <div style={{ marginTop: '5px', fontSize: '13px', color: '#444' }}>
                  {`Marked ${attendanceData[kid.name].status.toUpperCase()} at ${new Date(attendanceData[kid.name].markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
                </div>
              )}

              {attendanceData[kid.name]?.status === 'present' &&
                report &&
                getReportStatus(report) === REPORT_STATUS.FULL && (
                  <div style={{ display: 'flex', justifyContent: 'right' }}>
                    <button
                      style={styles.outButton}
                      onClick={() => handleMarkOutTime(kid.name)}
                    >
                      {report.outTime || 'Out Time'}
                    </button>
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Home;
