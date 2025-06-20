require('dotenv').config()
const express = require('express')
const nodemailer = require('nodemailer')
const cors = require('cors')
const bodyParser = require('body-parser')

const app = express()
app.use(cors())
app.use(bodyParser.json())

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

app.post('/api/inscriptions', async (req, res) => {
  const { firstName, age, phone, email } = req.body

  if (!firstName || !age || !phone || !email) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires.' })
  }

  // Mail de confirmation pour l'utilisateur
  const mailUser = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Confirmation d’inscription',
    text: `Bonjour ${firstName},\n\nMerci pour votre inscription ! Nous avons bien reçu vos informations.\n\nÀ bientôt !`,
  }

  // Mail de notification pour toi
  const mailNotify = {
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: 'Nouvelle inscription',
    text: `Nouvelle inscription reçue :\nPrénom : ${firstName}\nÂge : ${age}\nTéléphone : ${phone}\nEmail : ${email}`,
  }

  try {
    await transporter.sendMail(mailUser)
    await transporter.sendMail(mailNotify)
    res.json({ message: 'Inscription reçue et email envoyé !' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Erreur lors de l’envoi des emails.' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`)
})
