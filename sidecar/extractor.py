import sys
import json
import argparse
import traceback

def extract_pdf(path):
    import pdfplumber
    text = ""
    with pdfplumber.open(path) as pdf:
        # Cap at 5 pages for UI preview speed
        for page in pdf.pages[:5]:
            extracted = page.extract_text()
            if extracted: text += extracted + "\n"
    return text[:3000].strip() # Strict hard cap for memory safety

def extract_docx(path):
    import docx
    doc = docx.Document(path)
    # Cap at first 50 paragraphs
    text = "\n".join([p.text for p in doc.paragraphs][:50])
    return text[:3000].strip()

def extract_audio(path):
    from mutagen import File
    import mutagen.id3
    audio = File(path)
    if not audio: return "{}"
    meta = {}
    
    # Fallback tag parsing for standard ID3 and Vorbis/FLAC
    if 'TIT2' in audio: meta['title'] = str(audio['TIT2'])
    elif hasattr(audio, 'tags') and audio.tags and 'title' in audio.tags: meta['title'] = str(audio.tags['title'][0])
    
    if 'TPE1' in audio: meta['artist'] = str(audio['TPE1'])
    elif hasattr(audio, 'tags') and audio.tags and 'artist' in audio.tags: meta['artist'] = str(audio.tags['artist'][0])
    
    if 'TALB' in audio: meta['album'] = str(audio['TALB'])
    elif hasattr(audio, 'tags') and audio.tags and 'album' in audio.tags: meta['album'] = str(audio.tags['album'][0])
    
    if hasattr(audio, 'info'):
        meta['length'] = round(audio.info.length) if hasattr(audio.info, 'length') else 0
        meta['bitrate'] = audio.info.bitrate if hasattr(audio.info, 'bitrate') else 0

    return json.dumps(meta)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--path', required=True)
    args = parser.parse_args()
    
    path = args.path
    path_lower = path.lower()
    
    payload = {"status": "error"}

    try:
        if path_lower.endswith('.pdf'):
            data = extract_pdf(path)
            payload = {"status": "ok", "type": "text", "data": data}
        elif path_lower.endswith('.docx'):
            data = extract_docx(path)
            payload = {"status": "ok", "type": "text", "data": data}
        elif path_lower.endswith(('.txt', '.md', '.json', '.toml', '.py', '.js', '.css', '.html', '.rs', '.csv', '.ini', '.yaml', '.yml', '.env')):
            # Universal text fallback (first 3000 chars)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                data = f.read(3000)
            payload = {"status": "ok", "type": "text", "data": data}
        elif path_lower.endswith(('.mp3', '.flac', '.wav', '.ogg', '.m4a')):
            data = extract_audio(path)
            # Send back the JSON string payload directly
            payload = {"status": "ok", "type": "audio", "data": data}
        else:
            payload = {"status": "ignored", "data": "No extraction handler available."}

    except Exception as e:
        payload = {"status": "error", "error": str(e)}

    # Print pure JSON to stdout for rust to capture
    print(json.dumps(payload), flush=True)

if __name__ == '__main__':
    main()
