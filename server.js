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

// Download endpoint for forms (forces download instead of loading in browser)
app.get('/api/download-form/:filename', (req, res) => {
    try {
        const filename = decodeURIComponent(req.params.filename);
        const filepath = path.join(__dirname, 'awards-form', filename);
        
        // Security check: ensure file is within awards-form directory
        const normalized = path.normalize(filepath);
        const allowedPath = path.normalize(path.join(__dirname, 'awards-form'));
        if (!normalized.startsWith(allowedPath)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set headers to force download with RFC 5987 encoded filename
        // This handles special characters like spaces and parentheses securely
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Security-Policy', 'default-src \'none\'');
        res.download(filepath);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve the awards forms for preview
app.use('/forms', express.static(path.join(__dirname, 'awards-form')));

const EXCEL_FILE = path.join(__dirname, 'nomination_data_2026-02-18 (1).xlsx');
const SCRUTINY_FILE = path.join(__dirname, 'scrutinity_members.json');
const SUPPORTING_FILE = path.join(__dirname, 'supporting_documents.json');
const FORM_MAPPING_FILE = path.join(__dirname, 'award_form_mapping.json');

// Helper function to get correct protocol (handles Vercel load balancer)
function getBaseUrl(req) {
    if (!req) return 'http://localhost:3001';
    
    // Check for x-forwarded-proto header (set by Vercel/proxies)
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    
    return `${proto}://${host}`;
}

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
    
    const awards = fullAwardString.split(',').map(s => s.trim());
    let allDocs = new Set();
    const supportingKeys = Object.keys(supportingData);

    awards.forEach(selectedAward => {
        const normAward = normalize(selectedAward);
        
        let match = supportingKeys.find(key => {
            const normKey = normalize(key);
            return normKey.includes(normAward) || normAward.includes(normKey);
        });

        if (!match) {
            const mappings = [
                { keywords: ['sport', 'athlete'], target: 'Best Sports Performer Award' },
                { keywords: ['project', 'finalyear'], target: 'Best Project Award' },
                { keywords: ['outgoing', 'studentoftheyear'], target: 'Best Outgoing Student' },
                { keywords: ['academic', 'performer', 'scholastic'], target: 'Best Academic Performer Award' },
                { keywords: ['coder', 'program', 'developer'], target: 'Best Coder Award' },
                { keywords: ['volunteer', 'organizer', 'team'], target: 'Best Volunteer/ Organizer/ Team Player Award' },
                { keywords: ['research', 'publication'], target: 'Best Researcher Award' },
                { keywords: ['learning', 'continuous', 'skill'], target: 'Best Continuous Learner Award' },
                { keywords: ['hackathon', 'team'], target: 'Best Hackathon Contributor Award' },
                { keywords: ['placement', 'offer'], target: 'Best Placement Achiever Award (Final year only)' },
                { keywords: ['entertainer', 'performance'], target: 'Best Entertainer Award' },
                { keywords: ['entrepreneur', 'startup'], target: 'Best Entrepreneur Award' },
                { keywords: ['rising', 'talent', 'firstyear'], target: 'Best Rising Talent Award (First year only)' },
                { keywords: ['barrier', 'overcome'], target: 'Breaking the Barrier Award' },
                { keywords: ['social', 'impact', 'society'], target: 'Social Impact Through Technology Award' }
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
    const awardParts = selectedAward.split(',').map(s => s.trim());
    let scrutinyMembers = new Set();
    let formLinks = [];
    let allDocs = new Set();
    
    const scrutinyMappings = [
        { keywords: ['sport', 'athlete'], target: 'Best Sports Performer Award' },
        { keywords: ['academic', 'performer'], target: 'Best Academic Performer Award' },
        { keywords: ['coder', 'program'], target: 'Best Coder Award' },
        { keywords: ['research'], target: 'Best Researcher Award' },
        { keywords: ['learning', 'continuous'], target: 'Best Continuous Learner Award' },
        { keywords: ['hackathon'], target: 'Best Hackathon Contributor Award' },
        { keywords: ['placement'], target: 'Best Placement Achiever Award (Final year only)' },
        { keywords: ['volunteer', 'organizer', 'team'], target: 'Best Volunteer/ Organizer/ Team Player Award' },
        { keywords: ['entertainer', 'performance'], target: 'Best Entertainer Award' },
        { keywords: ['entrepreneur'], target: 'Best Entrepreneur Award' },
        { keywords: ['rising', 'talent'], target: 'Best Rising Talent Award (First year only)' },
        { keywords: ['project'], target: 'Best Project Award' },
        { keywords: ['outgoing'], target: 'Best Outgoing Student' },
        { keywords: ['barrier'], target: 'Breaking the Barrier Award' },
        { keywords: ['social', 'impact'], target: 'Social Impact Through Technology Award' }
    ];

    const baseUrl = getBaseUrl(req);

    awardParts.forEach(part => {
        const normPart = normalize(part);
        const match = scrutinyMappings.find(m => m.keywords.some(k => normPart.includes(k)));
        
        if (match) {
            // Get Scrutiny Members
            const sData = scrutinyData.find(s => s.award === match.target);
            if (sData) sData.scrutiny_members.forEach(m => scrutinyMembers.add(m));
            
            // Get Form Link
            const formFile = formMapping[match.target];
            if (formFile && !formLinks.find(f => f.filename === formFile)) {
                formLinks.push({
                    award: match.target,
                    filename: formFile,
                    url: `${baseUrl}/api/download-form/${encodeURIComponent(formFile)}`
                });
            }

            // Get Docs
            if (supportingData[match.target]) {
                supportingData[match.target].supporting_documents.forEach(d => allDocs.add(d));
            }
        }
    });

    return {
        scrutinyMembers: scrutinyMembers.size > 0 ? Array.from(scrutinyMembers) : ["Awards Committee"],
        supportingDocuments: Array.from(allDocs),
        formLinks: formLinks,
        formLink: formLinks.length > 0 ? formLinks[0].url : null
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
                formLink: context.formLink,
                formLinks: context.formLinks
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
        formLinks: context.formLinks
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

    const docsList = (nominee.supportingDocuments || []).map(doc => `
        <li style="margin-bottom: 8px; padding-left: 5px;">
            <span style="color: #4f46e5;">•</span> ${doc}
        </li>`).join('');
    
    const scrutinyList = (nominee.scrutinyMembers || [])
        .map(m => `<span style="background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; margin-right: 5px; font-size: 12px; border: 1px solid #e5e7eb;">${m}</span>`)
        .join(' ');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const deadline = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let htmlContent = fs.readFileSync(path.join(__dirname, 'mail_template.html'), 'utf8');
    
    const downloadSection = generateDownloadSection(nominee.formLinks);

    const replacements = {
        '{{name}}': nominee.name,
        '{{award}}': nominee.award,
        '{{docsList}}': docsList,
        '{{scrutinyList}}': scrutinyList,
        '{{downloadLink}}': downloadSection,
        '{{deadline}}': deadline
    };

    Object.keys(replacements).forEach(key => {
        // Escape the curly braces for the regex to avoid quantifier issues
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKey, 'g');
        htmlContent = htmlContent.replace(regex, replacements[key]);
    });

    const mailOptions = {
        from: `"Awards Selection Committee" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `DEBUG: Award Preview - ${nominee.award}`,
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[Email Success] MessageID:', info.messageId);
        console.log('[Email Success] Response:', info.response);
        res.json({ 
            success: true, 
            message: `Debug email for "${award}" sent to ${email}`, 
            messageId: info.messageId,
            context 
        });
    } catch (error) {
        console.error('[Email Failed] Details:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to generate download section HTML for single or multiple forms
function generateDownloadSection(formLinks) {
    if (!formLinks || formLinks.length === 0) {
        return `<div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #fffbeb; border: 2px dashed #f59e0b; border-radius: 8px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
                <strong>Nomination Form Note:</strong><br>
                A specific form for this award category could not be automatically attached. 
                Please contact the Awards Committee or check the department notice board.
            </p>
        </div>`;
    }
    
    if (formLinks.length === 1) {
        const form = formLinks[0];
        return `<div style="text-align: center; margin: 30px 0;">
            <a href="${form.url}" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.4);">Download Nomination Form</a>
            <p style="margin-top: 12px; font-size: 12px; color: #6b7280;">
                Trouble with the button? <a href="${form.url}" style="color: #4f46e5; text-decoration: underline;">Click here to download</a>
            </p>
        </div>`;
    } else {
        const formButtons = formLinks.map(form => `
            <div style="margin-bottom: 12px;">
                <a href="${form.url}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; width: 80%; max-width: 300px; text-align: center;">Download: ${form.award}</a>
            </div>`).join('');
        
        return `<div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <p style="font-size: 14px; color: #374151; margin-bottom: 15px; font-weight: 600;">Action Required: Multiple Forms to Download</p>
            ${formButtons}
            <p style="margin-top: 15px; font-size: 11px; color: #94a3b8;">
                You have been nominated for multiple categories. Please fill out separate forms for each.
            </p>
        </div>`;
    }
}

app.post('/api/send-email', async (req, res) => {
    const { nominee } = req.body;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return res.status(500).json({ error: 'Email credentials not configured in .env' });
    }

    console.log(`[Email] Processing: ${nominee.name} <${nominee.email}>`);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    // Group documents if there are multiple awards
    const docsList = (nominee.supportingDocuments || []).map(doc => `
        <li style="margin-bottom: 8px; padding-left: 5px;">
            <span style="color: #4f46e5; font-weight: bold;">•</span> ${doc}
        </li>`).join('');
    
    const scrutinyList = (nominee.scrutinyMembers || [])
        .map(m => `<span style="background-color: #f3f4f6; padding: 4px 10px; border-radius: 4px; margin-right: 6px; margin-bottom: 6px; font-size: 12px; border: 1px solid #e5e7eb; display: inline-block; color: #374151;">${m}</span>`)
        .join('');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2); // Give 2 days deadline
    const deadline = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let htmlContent = fs.readFileSync(path.join(__dirname, 'mail_template.html'), 'utf8');
    
    const downloadSection = generateDownloadSection(nominee.formLinks);

    // Replace placeholders using Global regex to handle multiple occurrences if any
    const replacements = {
        '{{name}}': nominee.name,
        '{{award}}': nominee.award,
        '{{docsList}}': docsList,
        '{{scrutinyList}}': scrutinyList,
        '{{downloadLink}}': downloadSection,
        '{{deadline}}': deadline
    };

    Object.keys(replacements).forEach(key => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKey, 'g');
        htmlContent = htmlContent.replace(regex, replacements[key]);
    });

    const mailOptions = {
        from: `"Awards Selection Committee" <${process.env.EMAIL_USER}>`,
        to: nominee.email,
        subject: `ACTION REQUIRED: Documentation for Excellency Awards 2026`,
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Sent Success] To: ${nominee.email}, MessageID: ${info.messageId}`);
        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('[Email Sent Failed] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test-email', async (req, res) => {
    const { email } = req.body;
    const { scrutinyData, supportingData, formMapping } = getMappings();
    
    // Example data for Sharvani B
    const award = "Best Volunteer/Organizer/Team player";
    const context = getAwardContext(award, scrutinyData, supportingData, formMapping, req);
    
    const nominee = {
        name: "Sharvani B",
        email: email,
        award: award,
        scrutinyMembers: context.scrutinyMembers,
        supportingDocuments: context.supportingDocuments,
        formLinks: context.formLinks
    };

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
    tomorrow.setDate(tomorrow.getDate() + 2);
    const deadline = tomorrow.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    let htmlContent = fs.readFileSync(path.join(__dirname, 'mail_template.html'), 'utf8');
    
    const downloadSection = generateDownloadSection(nominee.formLinks);
    
    const replacements = {
        '{{name}}': nominee.name,
        '{{award}}': nominee.award,
        '{{docsList}}': docsList,
        '{{scrutinyList}}': scrutinyList,
        '{{downloadLink}}': downloadSection,
        '{{deadline}}': deadline
    };

    Object.keys(replacements).forEach(key => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKey, 'g');
        htmlContent = htmlContent.replace(regex, replacements[key]);
    });

    const mailOptions = {
        from: `"Awards Selection Committee" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `TEST: Action Required - Documents for ${nominee.award}`,
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Test Email Success] To: ${email}, MessageID: ${info.messageId}`);
        res.json({ success: true, message: `Example email sent to ${email}`, messageId: info.messageId });
    } catch (error) {
        console.error('[Test Email Failed] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3001;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}

module.exports = app;