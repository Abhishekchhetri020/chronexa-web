import json
import sys

def fix_benchmark(input_path, output_path):
    """Convert classId/teacherId to classIds/teacherIds arrays"""
    with open(input_path, 'r') as f:
        data = json.load(f)
    
    for lesson in data['lessons']:
        # Convert singular to plural
        if 'classId' in lesson:
            lesson['classIds'] = [lesson['classId']]
            del lesson['classId']
        if 'teacherId' in lesson:
            lesson['teacherIds'] = [lesson['teacherId']]
            del lesson['teacherId']
        
        # Ensure periodsPerDay exists (default to 1)
        if 'periodsPerDay' not in lesson:
            lesson['periodsPerDay'] = 1
        
        # Ensure doubleLesson exists (default to false)
        if 'doubleLesson' not in lesson:
            lesson['doubleLesson'] = False
    
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Fixed: {input_path} -> {output_path}")
    print(f"  {len(data['lessons'])} lessons updated")

if __name__ == '__main__':
    benchmarks = [
        'small_school.json',
        'medium_school.json',
        'large_school.json'
    ]
    
    for bench in benchmarks:
        input_path = f'/Users/abhishekchhetri/chronexa-web/benchmarks/{bench}'
        fix_benchmark(input_path, input_path)
