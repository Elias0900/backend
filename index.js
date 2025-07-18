require('dotenv').config()
const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const cors = require('cors')
const bodyParser = require('body-parser')
const nodemailer = require('nodemailer')
const path = require('path')
const ExcelJS = require('exceljs') // <-- ajouté

const app = express()
app.use(cors())
app.use(bodyParser.json())

const allowedOrigins = [
  'http://localhost:5173', // ou ton port de dev
  'https://ton-frontend.vercel.app', // ou ton domaine
]

app.use(cors({
  origin: allowedOrigins,
}))


// Connexion à la base SQLite
const db = new sqlite3.Database('./inscriptions.db', (err) => {
  if (err) {
    console.error('Erreur ouverture DB:', err.message)
  } else {
    console.log('Base SQLite connectée.')
  }
})

// Création de la table si elle n'existe pas
db.run(`
  CREATE TABLE IF NOT EXISTS inscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL
  )
`)

// Configuration de nodemailer avec Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// Route d'inscription
app.post('/api/inscriptions', (req, res) => {
  const { firstName, age, phone, email } = req.body

  if (!firstName || !age || !phone || !email) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires.' })
  }

  const checkSql = `SELECT * FROM inscriptions WHERE first_name = ? AND email = ?`
  db.get(checkSql, [firstName, email], (err, row) => {
    if (err) {
      console.error('Erreur vérification DB:', err.message)
      return res.status(500).json({ message: 'Erreur lors de la vérification en base.' })
    }

    if (row) {
      return res.status(400).json({ message: 'Une inscription avec ce prénom et cet email existe déjà.' })
    }

    const insertSql = `INSERT INTO inscriptions (first_name, age, phone, email) VALUES (?, ?, ?, ?)`
    db.run(insertSql, [firstName, age, phone, email], function(err) {
      if (err) {
        console.error('Erreur insertion DB:', err.message)
        return res.status(500).json({ message: 'Erreur lors de l’enregistrement en base.' })
      }

   const mailUser = {
     from: process.env.SMTP_USER,
     to: email,
     subject: 'Confirmation d’inscription',
     text: `Bonjour ${firstName},

   Merci pour votre inscription !

   Merci de prévoir de l'espèce pour payer l'inscription sur place.

   Ce message est envoyé automatiquement, merci de ne pas y répondre.

   À bientôt !`
   }


      const mailNotify = {
        from: process.env.SMTP_USER,
        to: process.env.NOTIFY_EMAIL,
        subject: 'Nouvelle inscription',
        text: `Nouvelle inscription reçue :\nPrénom : ${firstName}\nÂge : ${age}\nTéléphone : ${phone}\nEmail : ${email}`,
      }

      transporter.sendMail(mailUser, (errorUser) => {
        if (errorUser) {
          console.error('Erreur envoi mail utilisateur:', errorUser)
          return res.status(500).json({ message: 'Erreur lors de l’envoi de l’email de confirmation.' })
        }

        transporter.sendMail(mailNotify, (errorNotify) => {
          if (errorNotify) {
            console.error('Erreur envoi mail admin:', errorNotify)
            return res.status(500).json({ message: 'Erreur lors de l’envoi de l’email de notification.' })
          }

          res.json({ message: 'Inscription enregistrée et emails envoyés !' })
        })
      })
    })
  })
})

/** 🔐 Endpoint sécurisé pour exporter la base SQLite */
app.get('/api/export-db', (req, res) => {
  const auth = req.query.secret
  if (auth !== process.env.EXPORT_SECRET) {
    return res.status(403).send('Accès refusé.')
  }

  const filePath = path.resolve('./inscriptions.db')
  res.download(filePath, 'inscriptions.db', (err) => {
    if (err) {
      console.error('Erreur téléchargement DB :', err)
      res.status(500).send('Erreur serveur lors du téléchargement.')
    }
  })
})

/** 🔐 Endpoint reset : drop + recreate la table */
app.post('/api/reset-db', (req, res) => {
  const auth = req.query.secret
  if (auth !== process.env.EXPORT_SECRET) {
    return res.status(403).send('Accès refusé.')
  }

  db.serialize(() => {
    db.run(`DROP TABLE IF EXISTS inscriptions`, (err) => {
      if (err) {
        console.error('Erreur drop table:', err)
        return res.status(500).json({ message: 'Erreur lors de la suppression de la table.' })
      }
      db.run(`
        CREATE TABLE inscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          first_name TEXT NOT NULL,
          age INTEGER NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('Erreur création table:', err)
          return res.status(500).json({ message: 'Erreur lors de la création de la table.' })
        }
        res.json({ message: 'Base de données réinitialisée avec succès.' })
      })
    })
  })
})

/** 🔐 Endpoint export Excel */
app.get('/api/export-excel', (req, res) => {
  const auth = req.query.secret
  if (auth !== process.env.EXPORT_SECRET) {
    return res.status(403).send('Accès refusé.')
  }

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Inscriptions')

  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Prénom', key: 'first_name', width: 30 },
    { header: 'Âge', key: 'age', width: 10 },
    { header: 'Téléphone', key: 'phone', width: 20 },
    { header: 'Email', key: 'email', width: 30 },
  ]

  db.all('SELECT * FROM inscriptions', (err, rows) => {
    if (err) {
      console.error('Erreur lecture DB:', err)
      return res.status(500).send('Erreur lecture base.')
    }

    rows.forEach(row => worksheet.addRow(row))

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="inscriptions.xlsx"'
    )

    workbook.xlsx.write(res).then(() => {
      res.end()
    }).catch(error => {
      console.error('Erreur écriture Excel:', error)
      res.status(500).send('Erreur lors de la génération du fichier Excel.')
    })
  })
})

// Lancer le serveur
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`)
})
