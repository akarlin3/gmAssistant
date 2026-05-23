import re

with open('components/CampaignEditor.tsx', 'r') as f:
    lines = f.readlines()

def get_block(start_str, end_str, start_idx=0):
    start = -1
    for i in range(start_idx, len(lines)):
        if lines[i].startswith(start_str):
            start = i
            break
    if start == -1: return -1, -1
    
    end = -1
    for i in range(start, len(lines)):
        if end_str in lines[i]:
            end = i
            break
    return start, end

# Find const M
s1, _ = get_block('const M =', '')
# Find end of DowntimeCard
_, e1 = get_block('const DowntimeCard =', '};', s1)

# Find Phase
s2, e2 = get_block('const Phase =', ');')

print(f"UI Block 1: {s1+1} to {e1+1}")
print(f"UI Block 2: {s2+1} to {e2+1}")
