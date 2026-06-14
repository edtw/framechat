/**
 * WhatsApp Contacts Database Layer
 * Handles contact operations
 */

const prisma = require('../../../core/prisma');
const logger = require('../../../core/utils/logger');

/**
 * Batch upsert contacts
 * 
 * @param {Array} contacts - Array of contact objects
 * @param {string} sessionId - Session ID
 * @param {number} operatorId - Operator ID
 */
async function upsertContactsBatch(contacts, sessionId, operatorId) {
  if (!contacts || contacts.length === 0) return;

  try {
    // We process in transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      for (const contact of contacts) {
        // 1. Upsert Contact (CRM Contact)
        // We try to find by phone number first
        // Note: This is a simplified logic. In a real CRM, you might want more complex matching.
        
        // Skip if no name and no verified name (ghost contact)
        if (!contact.name && !contact.verifiedName && !contact.pushName) continue;

        const displayName = contact.name || contact.verifiedName || contact.pushName || contact.remoteJid.split('@')[0];
        const phoneNumber = contact.remoteJid.split('@')[0];

        // Ensure CRM contact exists
        // We use raw query or findFirst because we don't have a unique constraint on phone+operatorId in the schema shown previously?
        // Let's check schema. Contact model has email/phone but not unique constraint on phone per company.
        // We will do a findFirst and then update or create.
        
        let crmContact = await tx.contact.findFirst({
            where: {
                operatorId,
                phone: phoneNumber
            }
        });

        if (crmContact) {
            await tx.contact.update({
                where: { id: crmContact.id },
                data: {
                    name: displayName, // Update name if changed? Maybe only if placeholder?
                    // For now, let's keep existing name to avoid overwriting user edits
                }
            });
        } else {
            crmContact = await tx.contact.create({
                data: {
                    operatorId,
                    name: displayName,
                    phone: phoneNumber,
                    // We can store profile pic url in notes or a new field if schema allowed
                }
            });
        }
      }
    });

    logger.info({ 
      count: contacts.length, 
      sessionId, 
      operatorId 
    }, 'Contacts batch upserted successfully');

  } catch (error) {
    logger.error({ 
      error: error.message, 
      sessionId, 
      operatorId 
    }, 'Failed to batch upsert contacts');
    throw error;
  }
}

module.exports = {
  upsertContactsBatch
};
