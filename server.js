require('dotenv').config();
const express = require('express');
const cors = require('cors');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the awards forms for download
app.use('/forms', express.static(path.join(__dirname, 'awards-form')));

const EXCEL_FILE = path.join(__dirname, 'nomination_data_2026-02-18 (1).xlsx');
const SCRUTINY_FILE = path.join(__dirname, 'scrutinity_members.json');
const SUPPORTING_FILE = path.join(__dirname, 'supporting_documents.json');
const FORM_MAPPING_FILE = path.join(__dirname, 'award_form_mapping.json');

// Utility to normalize strings for comparison
const normalize = (str) => str?.toLowerCase().replace(/[^a-z]/g, '') || '';

function getMappings() {
    const scrutinyData = JSON.parse(fs.readFileSync(SCRUTINY_FILE, 'utf8')).excellency_award_scrutiny_detail;
    const supportingData = JSON.parse(fs.readFileSync(SUPPORTING_FILE, 'utf8'));
    const formMapping = JSON.parse(fs.readFileSync(FORM_MAPPING_FILE, 'utf8'));

    return { scrutinyData, supportingData, formMapping };
}

function getSupportingDocs(fullAwardString, supportingData) {
    if (!fullAwardString) return [];
    
    // Split in case there are multiple awards selected (e.g. "Award A, Award B")
    const awards = fullAwardString.split(',').map(s => s.trim());
    let allDocs = new Set();

    const supportingKeys = Object.keys(supportingData);

    awards.forEach(selectedAward => {
        const normAward = normalize(selectedAward);
        
        // 1. Try to find a match for this specific award segment
        let match = supportingKeys.find(key => {
            const normKey = normalize(key);
            return normKey.includes(normAward) || normAward.includes(normKey);
        });

        // 2. Keyword/Alias mapping
        if (!match) {
            const mappings = [
                { keywords: ['sport', 'sports'], target: 'Best Sports Performer Award' },
                { keywords: ['project'], target: 'Best Project Award' },
                { keywords: ['outgoing', 'student'], target: 'Best Outgoing Student' },
                { keywords: ['academic', 'performer'], target: 'Best Academic Performer Award' },
                { keywords: ['coder', 'programmer'], target: 'Best Coder Award' },
                { keywords: ['volunteer', 'organizer', 'team'], target: 'Best Volunteer/ Organizer/ Team Player Award' },
                { keywords: ['research'], target: 'Best Researcher Award' },
                { keywords: ['learning', 'continuous', 'learner'], target: 'Best Continuous Learner Award' },
                { keywords: ['hackathon'], target: 'Best Hackathon Contributor Award' },
                { keywords: ['placement'], target: 'Best Placement Achiever Award (Final year only)' },
                { keywords: ['entertainer', 'entertainment'], target: 'Best Entertainer Award' },
                { keywords: ['entrepreneur'], target: 'Best Entrepreneur Award' },
                { keywords: ['rising', 'talent'], target: 'Best Rising Talent Award (First year only)' },
                { keywords: ['barrier'], target: 'Breaking the Barrier Award' },
                { keywords: ['social', 'impact'], target: 'Social Impact Through Technology Award' }
            ];

            const found = mappings.find(m => m.keywords.some(k => normAward.includes(k)));
            if (found) match = found.target;
        }

        if (match && supportingData[match]) {
            supportingData[match].supporting_documents.forEach(doc => allDocs.add(doc));
        }
    });

    return Array.from(allDocs);
}

function getAwardContext(selectedAward, scrutinyData, supportingData, formMapping, req) {
    const docs = getSupportingDocs(selectedAward, supportingData);
    const awardParts = selectedAward.split(',').map(s => normalize(s.trim()));
    let scrutinyMembers = new Set();
    let canonicalAward = "Awards Selection Committee";
    
    const scrutinyMappings = [
        { keywords: ['sport'], target: 'Best Sports Performer Award' },
        { keywords: ['academic', 'performer'], target: 'Best Academic Performer Award' },
        { keywords: ['coder', 'program'], target: 'Best Coder Award' },
        { keywords: ['research'], target: 'Best Researcher Award' },
        { keywords: ['learning', 'continuous'], target: 'Best Continuous Learner Award' },
        { keywords: ['hackathon'], target: 'Best Hackathon Contributor Award' },
        { keywords: ['placement'], target: 'Best Placement Achiever Award (Final year only)' },
        { keywords: ['volunteer', 'organizer', 'team'], target: 'Best Volunteer/ Organizer/ Team Player Award' },
        { keywords: ['entertainer', 'entertainment'], target: 'Best Entertainer Award' },
        { keywords: ['entrepreneur'], target: 'Best Entrepreneur Award' },
        { keywords: ['rising', 'talent'], target: 'Best Rising Talent Award (First year only)' },
        { keywords: ['project'], target: 'Best Project Award' },
        { keywords: ['outgoing'], target: 'Best Outgoing Student' },
        { keywords: ['barrier'], target: 'Breaking the Barrier Award' },
        { keywords: ['social', 'impact'], target: 'Social Impact Through Technology Award' }
    ];

    awardParts.forEach(part => {
        const match = scrutinyMappings.find(m => m.keywords.some(k => part.includes(k)));
        if (match) {
            canonicalAward = match.target;
            const data = scrutinyData.find(s => s.award === match.target);
            if (data) data.scrutiny_members.forEach(m => scrutinyMembers.add(m));
        }
    });

    const formFile = formMapping[canonicalAward] || null;
    const baseUrl = req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3001';
    const formLink = formFile ? `${baseUrl}/forms/${encodeURIComponent(formFile)}` : null;

    return {
        scrutinyMembers: scrutinyMembers.size > 0 ? Array.from(scrutinyMembers) : ["Awards Committee"],
        supportingDocuments: docs,
        formLink: formLink
    };
}

app.get('/api/nominees', (req, res) => {
    try {
        const workbook = xlsx.readFile(EXCEL_FILE);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(sheet);
        
        const { scrutinyData, supportingData, formMapping } = getMappings();

        const nominees = rawData.map(row => {
            const selectedAward = row['Awards Selected'] || '';
            const context = getAwardContext(selectedAward, scrutinyData, supportingData, formMapping, req);

            return {
                id: row['Unique ID'] || Math.random().toString(36).substr(2, 9),
                name: row['Name'],
                email: row['Email'],
                award: selectedAward,
                regNo: row['Reg No'],
                scrutinyMembers: context.scrutinyMembers,
                supportingDocuments: context.supportingDocuments,
                formLink: context.formLink
            };
        });

        res.json(nominees);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/debug-email', async (req, res) => {
    const { email, award, name } = req.body;
    const { scrutinyData, supportingData, formMapping } = getMappings();

    if (!email || !award) {
        return res.status(400).json({ error: 'Email and award are required' });
    }

    const context = getAwardContext(award, scrutinyData, supportingData, formMapping, req);
    const nominee = {
        name: name || "Debug User",
        email: email,
        award: award,
        scrutinyMembers: context.scrutinyMembers,
        supportingDocuments: context.supportingDocuments,
        formLink: context.formLink
    };

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Email credentials not configured' });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const docsList = nominee.supportingDocuments.map(doc => `
        <li style="margin-bottom: 8px; padding-left: 5px;">
            <span style="color: #4f46e5;">•</span> ${doc}
        </li>`).join('');
    
    const scrutinyList = nominee.scrutinyMembers
        .map(m => `<span style="background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 5px; font-size: 12px; border: 1px solid #e5e7eb;">${m}</span>`)
        .join(' ');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deadline = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let htmlContent = fs.readFileSync(path.join(__dirname, 'mail_template.html'), 'utf8');
    
    const downloadSection = nominee.formLink 
        ? `<div style="text-align: center; margin: 30px 0;">
            <a href="${nominee.formLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Download Nomination Form</a>
            <p style="margin-top: 10px; font-size: 12px; color: #6b7280;">
                If the button doesn't work, copy and paste this link: <a href="${nominee.formLink}" style="color: #4f46e5; text-decoration: underline;">${nominee.formLink}</a>
            </p>
           </div>`
        : '';

    htmlContent = htmlContent
        .replace('{{name}}', nominee.name)
        .replace('{{award}}', nominee.award)
        .replace('{{docsList}}', docsList)
        .replace('{{scrutinyList}}', scrutinyList)
        .replace('{{downloadLink}}', downloadSection)
        .replace('{{deadline}}', deadline);

    const mailOptions = {
        from: `"Awards Selection Committee" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `DEBUG: Award Preview - ${nominee.award}`,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: `Debug email for "${award}" sent to ${email}`, context });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/send-email', async (req, res) => {
    const { nominee } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Email credentials not configured in .env' });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const docsList = (nominee.supportingDocuments || []).map(doc => `
        <li style="margin-bottom: 8px; padding-left: 5px;">
            <span style="color: #4f46e5;">•</span> ${doc}
        </li>`).join('');
    
    const scrutinyList = (nominee.scrutinyMembers || [])
        .map(m => `<span style="background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 5px; font-size: 12px; border: 1px solid #e5e7eb;">${m}</span>`)
        .join(' ');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deadline = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let htmlContent = fs.readFileSync(path.join(__dirname, 'mail_template.html'), 'utf8');
    
    const downloadSection = nominee.formLink 
        ? `<div style="text-align: center; margin: 30px 0;">
            <a href="${nominee.formLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Download Nomination Form</a>
            <p style="margin-top: 10px; font-size: 12px; color: #6b7280;">
                If the button doesn't work, copy and paste this link: <a href="${nominee.formLink}" style="color: #4f46e5; text-decoration: underline;">${nominee.formLink}</a>
            </p>
           </div>`
        : '';

    // Replace placeholders
    htmlContent = htmlContent
        .replace('{{name}}', nominee.name)
        .replace('{{award}}', nominee.award)
        .replace('{{docsList}}', docsList)
        .replace('{{scrutinyList}}', scrutinyList)
        .replace('{{downloadLink}}', downloadSection)
        .replace('{{deadline}}', deadline);

    const mailOptions = {
        from: `"Awards Selection Committee" <${process.env.EMAIL_USER}>`,
        to: nominee.email,
        subject: `ACTION REQUIRED: Documents for ${nominee.award}`,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error('Mail Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test-email', async (req, res) => {
    const { email } = req.body;
    const { formMapping } = getMappings();
    
    // Example data for Sharvani B
    const nominee = {
        name: "Sharvani B",
        email: email,
        award: "Best Volunteer/Organizer/Team player",
        scrutinyMembers: ["Dr.M.Hema", "Ms.K.Sudha"],
        supportingDocuments: [
            "Event Organization Proof",
            "Photographs / Media Coverage",
            "Letters of Appreciation from organizers / Faculty"
        ]
    };

    // Map form for test email
    const formFile = formMapping["Best Volunteer/ Organizer/ Team Player Award"];
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const formLink = formFile ? `${baseUrl}/forms/${encodeURIComponent(formFile)}` : null;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const docsList = nominee.supportingDocuments.map(doc => `
        <li style="margin-bottom: 8px; padding-left: 5px;">
            <span style="color: #4f46e5;">•</span> ${doc}
        </li>`).join('');
    
    const scrutinyList = nominee.scrutinyMembers
        .map(m => `<span style="background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 5px; font-size: 12px; border: 1px solid #e5e7eb;">${m}</span>`)
        .join(' ');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const deadline = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let htmlContent = fs.readFileSync(path.join(__dirname, 'mail_template.html'), 'utf8');
    
    const downloadSection = formLink 
        ? `<div style="text-align: center; margin: 30px 0;">
            <a href="${formLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Download Nomination Form</a>
            <p style="margin-top: 10px; font-size: 12px; color: #6b7280;">
                If the button doesn't work, copy and paste this link: <a href="${formLink}" style="color: #4f46e5; text-decoration: underline;">${formLink}</a>
            </p>
           </div>`
        : '';

    htmlContent = htmlContent
        .replace('{{name}}', nominee.name)
        .replace('{{award}}', nominee.award)
        .replace('{{docsList}}', docsList)
        .replace('{{scrutinyList}}', scrutinyList)
        .replace('{{downloadLink}}', downloadSection)
        .replace('{{deadline}}', deadline);

    const mailOptions = {
        from: `"Awards Selection Committee" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `TEST: Action Required - Documents for ${nominee.award}`,
        html: htmlContent
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: `Example email sent to ${email}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3001;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}

module.exports = app;