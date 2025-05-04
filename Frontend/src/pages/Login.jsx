// src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import giraffeIcon from '../assets/Logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) navigate('/');
    });
    return unsubscribe;
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#eef3f7', 
      padding: '0 16px',
      boxSizing: 'border-box'
    },
    card: {
      background: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.05)',
      padding: '32px',
      width: '100%',
      maxWidth: '400px',
      textAlign: 'center'
    },
    header: {
      marginBottom: '24px'
    },
    logo: {
      width: '80px',
      marginBottom: '12px'
    },
    title: {
      margin: 0,
      fontSize: '24px',
      color: '#5a6f8a',
      fontFamily: 'Inter, sans-serif'
    },
    form: {
      display: 'flex',
      flexDirection: 'column'
    },
    input: {
      width: '100%',
      padding: '12px',
      margin: '8px 0',
      borderRadius: '8px',
      border: '1px solid rgb(227, 219, 204)',
      fontSize: '1rem',
      background: '#f7faff',
      boxSizing: 'border-box'
    },
    passwordContainer: {
      position: 'relative'
    },
    toggle: {
      position: 'absolute',
      right: '10px',
      top: '50%',
      transform: 'translateY(-50%)',
      cursor: 'pointer',
      fontSize: '0.8rem',
      color: '#777'
    },
    button: {
      width: '100%',
      padding: '12px',
      margin: '16px 0 0',
      borderRadius: '8px',
      border: 'none',
      background: '#7da7f2',
      color: '#fff',
      fontSize: '1rem',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    error: {
      color: '#e06666',
      fontSize: '0.9rem',
      marginTop: '8px'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src={giraffeIcon} alt="Logo" style={styles.logo} />
          <h2 style={styles.title}>Welcome Back</h2>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <div style={styles.passwordContainer}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <span style={styles.toggle} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? 'Hide' : 'Show'}
            </span>
          </div>
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" style={styles.button}>Log In</button>
        </form>
      </div>
    </div>
  );
}
