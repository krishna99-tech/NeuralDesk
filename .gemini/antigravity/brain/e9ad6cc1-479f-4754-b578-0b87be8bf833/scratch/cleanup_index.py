import os

file_path = r'c:\Users\vakav\projects\New folder\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
styles_added = False

for line in lines:
    if '<style>' in line:
        skip = True
        if not styles_added:
            new_lines.append('<link rel="stylesheet" href="src/renderer/css/styles.css">\n')
            styles_added = True
        continue
    if '</style>' in line:
        skip = False
        continue
    
    if not skip:
        # Also replace the scripts at the bottom
        if '<script src="js/' in line:
            if 'index.js' not in "".join(new_lines[-5:]): # simple check to avoid duplicates
                 if 'marked' not in line and 'prism' not in line and 'chart.js' not in line:
                    continue # skip old scripts
        
        if '</body>' in line:
            new_lines.append('<script type="module" src="src/renderer/index.js"></script>\n')
        
        new_lines.append(line)

# Second pass to clean up duplicate script removals or add the new one correctly
final_lines = []
for line in new_lines:
    if '<script src="js/' in line:
        continue
    final_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)

print("Cleanup complete.")
