import 'reflect-metadata';
import { DataSource }      from 'typeorm';
import { databaseOptions } from './database.config.js';
import { User }            from '../auth/user.entity.js';
import { hash }            from '../auth/password.js';

const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!username || !/^[a-z0-9_]{3,32}$/.test(username) || !password || password.length < 12 || password.length > 256) {
  throw new Error('ADMIN_USERNAME(영문·숫자·밑줄 3~32자)과 ADMIN_PASSWORD(12~256자)를 설정해주세요.');
}

const database = await new DataSource({ ...databaseOptions, entities: [User] }).initialize();

try {
  const users = database.getRepository(User);
  if (await users.existsBy({ username })) throw new Error('이미 등록된 아이디입니다. 기존 계정은 변경하지 않습니다.');
  await users.insert({ username, passwordHash: await hash(password), role: 'ADMIN', status: 'ACTIVE' });
  console.log('관리자 계정을 생성했습니다.');
}
finally { await database.destroy(); }
