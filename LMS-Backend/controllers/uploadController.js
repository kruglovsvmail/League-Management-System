import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

export const uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не найден' });

    // Если с фронта пришло кастомное имя (например, user_1_avatar.png), используем его,
    // иначе берем оригинальное имя загружаемого файла
    const fileName = req.body.fileName ? `uploads/${req.body.fileName}` : `uploads/${req.file.originalname}`;

    await s3.send(new PutObjectCommand({
      Bucket: 'hockeyeco-uploads',
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    res.json({ 
      success: true, 
      url: `https://s3.twcstorage.ru/hockeyeco-uploads/${fileName}` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};