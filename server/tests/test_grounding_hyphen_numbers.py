"""Hyphenated number words ("twenty-seven-story") are checked like digits."""
import pytest

from app.agent.grounding import check_line, words_value
from app.data.provider import provider_for_mode

STORIES = 'F_233953_numStoriesAboveGrade'  # Esperson: 27
RBA = 'F_233953_rentableBuildingAreaSquareFeet'  # Esperson: 599,107 sq ft


@pytest.fixture
def esperson():
    return provider_for_mode('fixtures').dossier('233953')


@pytest.mark.parametrize('words,value', [
    ('twenty-seven', 27), ('nine-million', 9_000_000), ('one-hundred-twenty', 120),
    ('five-hundred-ninety-nine-thousand', 599_000), ('thirty-one-thousand', 31_000), ('nineteen', 19),
])
def test_words_value(words, value):
    assert words_value(words) == value


def test_hyphenated_story_count_must_match_the_dossier(esperson):
    assert check_line('I am a twenty-seven-story tower, darling.', [STORIES], esperson) is None
    assert check_line('I am a twenty-seven story tower, darling.', [STORIES], esperson) is None
    assert check_line('I am a twenty-eight-story tower, darling.', [STORIES], esperson)
    assert check_line('I am a forty-story tower, darling.', [STORIES], esperson)


def test_hyphenated_area_cannot_invent_square_feet(esperson):
    assert check_line('I am a nine-million-square-foot icon.', [RBA], esperson)
    assert check_line('A two-million-square-feet lobby awaits.', [RBA], esperson)


def test_conversational_hyphen_words_are_left_alone(esperson):
    assert check_line('A one-of-a-kind idea for my 27 stories.', [STORIES], esperson) is None
    assert check_line('It is a one-two punch for my 27 stories.', [STORIES], esperson) is None
