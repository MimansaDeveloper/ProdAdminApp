// src/pages/Home.jsx
import React, { useState, useEffect } from 'react';
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
import { db } from '../firebase/firebase';

const StarIcon = () => (
  <span style={{ color: '#FFD700', marginRight: '6px' }}>★</span>
);

const Home = () => {
  const navigate = useNavigate();

  // State for theme of the week (all available tags) and for theme of the day.
  const [themeTags, setThemeTags] = useState([]);
  const [dayThemes, setDayThemes] = useState([]);
  const [kids, setKids] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [dailyReportsMapping, setDailyReportsMapping] = useState({});
  const [docId, setDocId] = useState(null);

  const markedCount = Object.keys(attendanceData).length;

  // Updated UI styles including a new style for Report box.
  const styles = {
    container: {
      padding: '20px',
      fontFamily: 'Inter, Arial, sans-serif',
      background: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
      minHeight: '100vh',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
    },
    title: {
      margin: 0,
      color: '#555',
      fontSize: '24px',
      fontWeight: '700',
    },
    dateText: {
      fontSize: '16px',
      color: '#555',
    },
    attendanceSummary: {
      backgroundColor: '#444',
      color: '#fff',
      padding: '20px',
      borderRadius: '8px',
      marginBottom: '20px',
    },
    progressBarOuter: {
      width: '100%',
      height: '15px',
      backgroundColor: '#eee',
      borderRadius: '8px',
      marginTop: '15px',
    },
    progressBarInner: {
      height: '15px',
      backgroundColor: '#ffd60a',
      borderRadius: '8px',
      transition: 'width 0.4s ease',
    },
    themeLine: {
      marginTop: '10px',
      fontStyle: 'italic',
    },
    twoBoxesContainer: {
      display: 'flex',
      justifyContent: 'center',
      gap: '20px',
      marginBottom: '20px',
      // flexWrap: 'wrap',
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
      cursor: 'pointer',
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
      cursor: 'pointer',
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
      cursor: 'pointer',
    },
    attendanceSection: {
      backgroundColor: '#ffffff',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
      marginBottom: '20px',
    },
    kidRow: {
      padding: '10px 5px',
      borderBottom: '1px solid #eee',
    },
    rowTop: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    kidName: {
      fontSize: '16px',
      cursor: 'pointer',
      fontWeight: 'bold',
      color: '#555',
    },
    tickIcon: {
      color: 'green',
      marginLeft: '8px',
      fontSize: '18px',
    },
    buttonGroup: {
      display: 'flex',
      gap: '8px',
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
      transition: 'background-color 0.3s ease',
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
      color: '#fff',
    },
  };

  // Load kids from Firestore.
  const loadKidsInfo = async () => {
    try {
      const kidsSnapshot = await getDocs(collection(db, 'kidsInfo'));
      const kidsList = kidsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setKids(kidsList);
    } catch (error) {
      console.error('Error fetching kids info:', error);
    }
  };

  // Load theme settings from Firebase.
  const loadThemesFromFirebase = async () => {
    try {
      const themeDocRef = doc(db, 'appConfig', 'themeOfTheWeek');
      const snapshot = await getDoc(themeDocRef);
      if (snapshot.exists()) {
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
      }
    } catch (error) {
      console.error('Error loading themes from Firebase:', error);
    }
  };

  const fetchAttendance = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const endOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 1
      );
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
      let reportsMapping = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.childName) {
          reportsMapping[data.childName] = { ...data, id: docSnap.id };
        }
      });
      setDailyReportsMapping(reportsMapping);
    } catch (error) {
      console.error('Error fetching daily reports:', error);
    }
  };


  const handleMarkOutTime = async (kidName) => {
    const report = dailyReportsMapping[kidName];
    // Avoid re-marking if already set
    if (!report || report.outTime) return;

    const now = new Date();
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    try {
      const reportRef = doc(db, 'dailyReports', report.id);
      await updateDoc(reportRef, { outTime: formattedTime });

      // Update local state after successful write
      setDailyReportsMapping(prev => ({
        ...prev,
        [kidName]: { ...prev[kidName], outTime: formattedTime }
      }));
    } catch (error) {
      console.error('Error marking out time:', error);
      alert('Failed to mark out time.');
    }
  };

  const handleKidClick = (kidName) => {
    const attendance = attendanceData[kidName];
    if (!attendance || attendance.status !== 'present') {
      alert(`Daily report can only be submitted if ${kidName} is marked Present.`);
      return;
    }
    if (dailyReportsMapping[kidName]) {
      alert(`Daily report for ${kidName} has already been submitted.`);
    } else {
      navigate(
        `/daily-report?child=${encodeURIComponent(kidName)}&themeOfTheDay=${encodeURIComponent(dayThemes.join(', '))}`
      );
    }
  };

  /**
   * Mark or update attendance for a kid.
   * Clicking a button updates Firestore with the new status.
   */
  const markAttendance = async (kidName, status) => {
    const now = new Date();
    const dateString = now.toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const timeHHMM = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
    const updatedRecord = { status, time: timeHHMM, markedAt: dateString };

    // Update local state.
    setAttendanceData((prev) => ({ ...prev, [kidName]: updatedRecord }));

    try {
      if (docId) {
        const attendanceRef = doc(db, 'attendance', docId);
        await updateDoc(attendanceRef, {
          [`attendance.${kidName}`]: updatedRecord,
          date: new Date(),
        });
      } else {
        const newDoc = await addDoc(collection(db, 'attendance'), {
          date: new Date(),
          attendance: { [kidName]: updatedRecord },
        });
        setDocId(newDoc.id);
      }
    } catch (error) {
      console.error('Error marking attendance:', error);
      alert('Failed to mark attendance.');
    }
  };

  const todayDateString = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const progressPercentage =
    kids.length > 0 ? (markedCount / kids.length) * 100 : 0;

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
        <span style={styles.dateText}>{todayDateString}</span>
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
        <p style={styles.themeLine}>
          <StarIcon /> Theme of the week: {themeTags.join(', ')}
        </p>
        <p style={styles.themeLine}>
          <StarIcon /> Theme of the day: {dayThemes.join(', ')}
        </p>
      </div>

      {/* Navigation Boxes for Daily Updates, Manage Theme, and Report */}
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
        {kids.map((kid) => {
          // Determine the styling for the "Present" and "Absent" buttons
          const currentStatus = attendanceData[kid.name]?.status;
          const presentStyle = {
            ...styles.button,
            backgroundColor:
              currentStatus === 'present' ? '#90be6d' : '#ccc',
            color: currentStatus === 'present' ? '#fff' : '#333',
          };
          const absentStyle = {
            ...styles.button,
            backgroundColor: currentStatus === 'absent' ? '#f94144' : '#ccc',
            color: currentStatus === 'absent' ? '#fff' : '#333',
          };

          return (
            <div key={kid.id} style={styles.kidRow}>
              <div style={styles.rowTop}>
                <span
                  style={{
                    ...styles.kidName,
                    color:
                      currentStatus === 'present' ? '#0077b6' : '#555',
                  }}
                  onClick={() => handleKidClick(kid.name)}
                >
                  {kid.name}
                  {dailyReportsMapping[kid.name] && (
                    <span style={styles.tickIcon}>✓</span>
                  )}
                </span>
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

              {/* Always show button for present kids with a report; label shows time if set */}
              {attendanceData[kid.name]?.status === 'present' &&
                dailyReportsMapping[kid.name] && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    style={styles.outButton}
                    onClick={() => handleMarkOutTime(kid.name)}
                  >
                    {dailyReportsMapping[kid.name].outTime || 'Out Time'}
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
