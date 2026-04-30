$file = "js\app.js"
$c = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Replace "تقرير الأسبوع الماضي" with "تقرير الفترة السابقة"
$old1 = [char]0x062A + [char]0x0642 + [char]0x0631 + [char]0x064A + [char]0x0631 + " " + [char]0x0627 + [char]0x0644 + [char]0x0623 + [char]0x0633 + [char]0x0628 + [char]0x0648 + [char]0x0639 + " " + [char]0x0627 + [char]0x0644 + [char]0x0645 + [char]0x0627 + [char]0x0636 + [char]0x064A
$new1 = [char]0x062A + [char]0x0642 + [char]0x0631 + [char]0x064A + [char]0x0631 + " " + [char]0x0627 + [char]0x0644 + [char]0x0641 + [char]0x062A + [char]0x0631 + [char]0x0629 + " " + [char]0x0627 + [char]0x0644 + [char]0x0633 + [char]0x0627 + [char]0x0628 + [char]0x0642 + [char]0x0629
$count1 = ([regex]::Matches($c, [regex]::Escape($old1))).Count
$c = $c.Replace($old1, $new1)
Write-Host "Replaced '$old1' -> '$new1' ($count1 times)"

# Replace "تقرير الأسبوع (مجموعة" with "تقرير الفترة السابقة (مجموعة"  
$old2 = [char]0x062A + [char]0x0642 + [char]0x0631 + [char]0x064A + [char]0x0631 + " " + [char]0x0627 + [char]0x0644 + [char]0x0623 + [char]0x0633 + [char]0x0628 + [char]0x0648 + [char]0x0639 + " ("
$new2 = [char]0x062A + [char]0x0642 + [char]0x0631 + [char]0x064A + [char]0x0631 + " " + [char]0x0627 + [char]0x0644 + [char]0x0641 + [char]0x062A + [char]0x0631 + [char]0x0629 + " " + [char]0x0627 + [char]0x0644 + [char]0x0633 + [char]0x0627 + [char]0x0628 + [char]0x0642 + [char]0x0629 + " ("
$count2 = ([regex]::Matches($c, [regex]::Escape($old2))).Count
$c = $c.Replace($old2, $new2)
Write-Host "Replaced '$old2' -> '$new2' ($count2 times)"

# Replace "الأسبوع:" with "الفترة:" in report context
$old3 = [char]0x0627 + [char]0x0644 + [char]0x0623 + [char]0x0633 + [char]0x0628 + [char]0x0648 + [char]0x0639 + ":"
$new3 = [char]0x0627 + [char]0x0644 + [char]0x0641 + [char]0x062A + [char]0x0631 + [char]0x0629 + ":"
$count3 = ([regex]::Matches($c, [regex]::Escape($old3))).Count
$c = $c.Replace($old3, $new3)
Write-Host "Replaced '$old3' -> '$new3' ($count3 times)"

# Replace "التاريخ:" with "الفترة:" only in group report
$old4 = [char]0x0627 + [char]0x0644 + [char]0x062A + [char]0x0627 + [char]0x0631 + [char]0x064A + [char]0x062E + ":"
$new4 = [char]0x0627 + [char]0x0644 + [char]0x0641 + [char]0x062A + [char]0x0631 + [char]0x0629 + ":"
$count4 = ([regex]::Matches($c, [regex]::Escape($old4))).Count
$c = $c.Replace($old4, $new4)
Write-Host "Replaced '$old4' -> '$new4' ($count4 times)"

# Replace "هذا الأسبوع" with "هذه الفترة"
$old5 = [char]0x0647 + [char]0x0630 + [char]0x0627 + " " + [char]0x0627 + [char]0x0644 + [char]0x0623 + [char]0x0633 + [char]0x0628 + [char]0x0648 + [char]0x0639
$new5 = [char]0x0647 + [char]0x0630 + [char]0x0647 + " " + [char]0x0627 + [char]0x0644 + [char]0x0641 + [char]0x062A + [char]0x0631 + [char]0x0629
$count5 = ([regex]::Matches($c, [regex]::Escape($old5))).Count
$c = $c.Replace($old5, $new5)
Write-Host "Replaced '$old5' -> '$new5' ($count5 times)"

[System.IO.File]::WriteAllText($file, $c, [System.Text.Encoding]::UTF8)
Write-Host "Done!"
