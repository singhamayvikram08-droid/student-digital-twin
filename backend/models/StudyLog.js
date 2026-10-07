const mongoose = require('mongoose');

const studyLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    durationMinutes: {
        type: Number,
        required: true
    },
    productivityScore: {
        type: Number,
        min: 1,
        max: 10,
        required: true
    },
    notes: {
        type: String,
        maxlength: 500
    }
});

module.exports = mongoose.model('StudyLog', studyLogSchema);
