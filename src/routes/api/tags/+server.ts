import { json } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const tagsPath = join(process.cwd(), 'danbooru_tags.txt');
    const tagsContent = readFileSync(tagsPath, 'utf-8');
    const tags = tagsContent
      .split('\n')
      .map(tag => tag.trim())
      .filter(tag => tag); // Remove empty lines
    
    return json(tags);
  } catch (error) {
    console.error('Error reading danbooru tags:', error);
    return json([], { status: 500 });
  }
};