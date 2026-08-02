const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
};

const configureCloudinary = () => {
  if (isCloudinaryConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
};

configureCloudinary();

/**
 * Uploads a local file to Cloudinary free storage.
 * @param {String} localFilePath Absolute path to the file
 * @param {String} folder Optional subfolder name in Cloudinary
 * @returns {Promise<String|null>} Secure HTTPS URL of the uploaded file, or null if skipped
 */
const uploadToCloud = async (localFilePath, folder = 'ypss_question_papers', customOptions = {}) => {
  if (!isCloudinaryConfigured()) {
    console.log('[CloudStorage] Cloudinary credentials not configured in .env. Skipping cloud upload.');
    return null;
  }

  if (!fs.existsSync(localFilePath)) {
    console.warn(`[CloudStorage] File not found for cloud upload: ${localFilePath}`);
    return null;
  }

  try {
    const isDoc = /\.docx$/i.test(localFilePath);
    const isPdf = /\.pdf$/i.test(localFilePath);

    const defaultOptions = {
      resource_type: isDoc || isPdf ? 'raw' : 'auto',
      type: 'upload',
      folder: folder,
      use_filename: true,
      unique_filename: true,
    };

    const uploadOptions = { ...defaultOptions, ...customOptions };

    const result = await cloudinary.uploader.upload(localFilePath, uploadOptions);
    console.log(`[CloudStorage] Successfully uploaded to Cloudinary: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error(`[CloudStorage] Cloudinary upload failed for ${localFilePath}:`, error.message);
    return null;
  }
};

/**
 * Deletes a file from Cloudinary given its secure URL.
 * @param {String} url Cloudinary secure URL
 */
const deleteFromCloud = async (url) => {
  if (!isCloudinaryConfigured() || !url || typeof url !== 'string') {
    return;
  }

  try {
    const isDocOrPdf = /\.(docx|pdf)$/i.test(url);
    const resourceType = isDocOrPdf ? 'raw' : 'image';

    // Extract Cloudinary public_id from URL
    const match = url.match(/\/(?:upload|authenticated|private)\/(?:v\d+\/)?(.+?)$/);
    if (!match) return;

    let publicId = match[1];
    if (resourceType === 'image') {
      publicId = publicId.replace(/\.[^/.]+$/, '');
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' }).catch(() => {});
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'upload' }).catch(() => {});
    console.log(`[CloudStorage] Successfully deleted from Cloudinary: ${url}`);
  } catch (error) {
    console.warn(`[CloudStorage] Cloudinary deletion error for ${url}:`, error.message);
  }
};

module.exports = { uploadToCloud, deleteFromCloud, isCloudinaryConfigured };
