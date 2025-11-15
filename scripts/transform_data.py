#!/usr/bin/env python3
"""
Script to transform spreadsheet data into questions.json format
"""
import json
import re

# Your complete spreadsheet data goes here (paste the entire tab-separated data)
# Due to size, I'll create a structure that you can fill in

def generate_topic_id(topic_name):
    """Generate a URL-friendly topic ID"""
    return topic_name.lower().replace(' ', '-').replace('&', 'and').replace(/[^a-z0-9-]/g, '')

def get_answer_index(key):
    """Extract answer index from key like 'Option C' -> 2"""
    match = re.search(r'Option ([A-D])', key, re.IGNORECASE)
    if match:
        return ord(match.group(1).upper()) - ord('A')
    return 0

def clean_text(text):
    """Remove surrounding quotes and clean text"""
    return text.strip().strip('"')

def parse_tsv_line(line):
    """Parse a TSV line handling quotes"""
    # Simple split - for production, use csv module with dialect='excel-tab'
    return [field.strip() for field in line.split('\t')]

def process_data(tsv_data):
    """Process TSV data and return topics and questions"""
    lines = tsv_data.strip().split('\n')
    headers = parse_tsv_line(lines[0])
    
    topics_map = {}
    questions = []
    question_counter = {}
    
    for i, line in enumerate(lines[1:], 1):
        if not line.strip():
            continue
            
        fields = parse_tsv_line(line)
        if len(fields) < 12:  # Skip incomplete lines
            continue
        
        # Parse row
        topic = fields[0]
        sub_topic = fields[1]
        flashcard = clean_text(fields[2])
        answer = clean_text(fields[3])
        question = fields[4]
        difficulty = fields[5].lower()
        option_a = fields[6]
        option_b = fields[7]
        option_c = fields[8]
        option_d = fields[9]
        key = fields[10]
        explanation = clean_text(fields[11])
        
        # Generate topic ID
        topic_id = generate_topic_id(topic)
        
        # Add topic if not exists
        if topic_id not in topics_map:
            topics_map[topic_id] = {
                'id': topic_id,
                'name': topic,
                'description': f'Master {topic} concepts including {sub_topic} and related topics.',
                'hint': f'Learn the fundamental concepts and applications of {topic}.'
            }
        
        # Generate question ID
        if topic_id not in question_counter:
            question_counter[topic_id] = {'easy': 0, 'medium': 0, 'hard': 0}
        question_counter[topic_id][difficulty] += 1
        
        q_id = f"{topic_id[:3]}-{difficulty[0]}-{question_counter[topic_id][difficulty]}"
        
        # Add question
        questions.append({
            'id': q_id,
            'topicId': topic_id,
            'subTopic': sub_topic,
            'difficulty': difficulty,
            'flashcard': flashcard,
            'flashcardAnswer': answer,
            'question': question,
            'options': [option_a, option_b, option_c, option_d],
            'answerIndex': get_answer_index(key),
            'explanation': explanation
        })
    
    return {
        'topics': list(topics_map.values()),
        'questions': questions
    }

# Main execution
if __name__ == '__main__':
    print("Please paste your complete TSV data below and press Ctrl+D (Unix) or Ctrl+Z (Windows) when done:")
    print("Or edit this script to include the data directly.\n")
    
    # For now, create a sample structure
    sample_output = {
        "topics": [],
        "questions": []
    }
    
    print("Sample output structure created.")
    print("Edit this script to include your complete TSV data in the 'tsv_data' variable below.")
    print("\n# Example usage:")
    print("# tsv_data = '''paste your complete TSV data here'''")
    print("# result = process_data(tsv_data)")
    print("# with open('../data/questions.json', 'w') as f:")
    print("#     json.dump(result, f, indent=2)")
