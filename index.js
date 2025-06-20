require('dotenv').config()
const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const cors = require('cors')
const bodyParser = require('body-parser')
const nodemailer = require('nodemailer')

const app = express()
app.use(cors())
app.use(bodyParser.json())

// Ouvrir (ou créer) la base SQLite dans fichier local
const db = new sqlite3.Database('./inscriptions.db', (err) => {
  if (err) {
    console.error('Erreur ouverture DB:', err.message)
  } else {
    console.log('Base SQLite connectée.')
  }
})

// Créer la table si elle n'existe pas
db.run(`CREATE TABLE IF NOT EXISTS inscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL
)`)

// Config nodemailer avec Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

app.post('/api/inscriptions', (req, res) => {
  const { firstName, age, phone, email } = req.body

  if (!firstName || !age || !phone || !email) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires.' })
  }

  // Insérer dans SQLite
  const sql = `INSERT INTO inscriptions (first_name, age, phone, email) VALUES (?, ?, ?, ?)`
  db.run(sql, [firstName, age, phone, email], function(err) {
    if (err) {
      console.error('Erreur insertion DB:', err.message)
      return res.status(500).json({ message: 'Erreur lors de l’enregistrement en base.' })
    }

    // Envoi mail confirmation utilisateur
    const mailUser = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Confirmation d’inscription',
      text: `Bonjour ${firstName},\n\nMerci pour votre inscription !\n\nÀ bientôt !`,
    }

    // Envoi mail notification admin
    const mailNotify = {
      from: process.env.SMTP_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: 'Nouvelle inscription',
      text: `Nouvelle inscription reçue :\nPrénom : ${firstName}\nÂge : ${age}\nTéléphone : ${phone}\nEmail : ${email}`,
    }

    transporter.sendMail(mailUser, (errorUser) => {
      if (errorUser) {
        console.error('Erreur envoi mail user:', errorUser)
        return res.status(500).json({ message: 'Erreur lors de l’envoi de l’email utilisateur.' })
      }

      transporter.sendMail(mailNotify, (errorNotify) => {
        if (errorNotify) {
          console.error('Erreur envoi mail admin:', errorNotify)
          return res.status(500).json({ message: 'Erreur lors de l’envoi de l’email admin.' })
        }

        res.json({ message: 'Inscription enregistrée et emails envoyés !' })
      })
    })
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`)
})
