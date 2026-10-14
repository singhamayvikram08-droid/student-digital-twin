const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    subject: {
        type: String,
        required: [true, 'Please add a subject name']
    },
    classesConducted: {
        type: Number,
        default: 0
    },
    classesAttended: {
        type: Number,
        default: 0
    },
    targetPercentage: {
        type: Number,
        default: 75
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
